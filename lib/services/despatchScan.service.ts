import { createHash } from "crypto";
import { Types } from "mongoose";

import DespatchScan, { type IDespatchLine, type IDespatchScan } from "@/database/despatchScan.model";
import { extractDespatchSlip } from "@/lib/ai/extractDespatchSlip";
import { normaliseSlipLines, slipNumberKey, sumSlipTotals } from "@/lib/pos/despatchLines";
import dbConnect from "@/lib/mongoose";
import { listTerminalProducts } from "@/lib/services/posCatalog.service";
import { resolveSaleTill } from "@/lib/services/posTill.service";

export class DespatchScanError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
    public readonly existingScanId?: string
  ) {
    super(message);
  }
}

/** Phones send downsized photos (~1600px JPEG, well under this); anything bigger is refused. */
export const MAX_SLIP_IMAGE_BYTES = 4 * 1024 * 1024;

export interface DespatchScanDto {
  id: string;
  status: IDespatchScan["status"];
  processingError: string | null;
  branchId: string;
  tillId: string | null;
  slipNumber: string | null;
  customerName: string | null;
  customerTin: string | null;
  customerEmail: string | null;
  pricesIncludeVat: boolean | null;
  currency: "USD" | "ZWG" | null;
  slipGrandTotal: number | null;
  /** Sum of the slip's own line totals, so the review screen can compare it with the grand total. */
  slipLinesTotal: number | null;
  lines: (Omit<IDespatchLine, "productId"> & { productId: string | null })[];
  warnings: string[];
  hasImage: boolean;
  createdAt: string;
  appliedAt: string | null;
}

type ScanLean = IDespatchScan & { _id: Types.ObjectId; createdAt: Date };

function toDto(s: ScanLean): DespatchScanDto {
  return {
    id: String(s._id),
    status: s.status,
    processingError: s.processingError ?? null,
    branchId: String(s.branchId),
    tillId: s.tillId ? String(s.tillId) : null,
    slipNumber: s.slipNumber ?? null,
    customerName: s.customerName ?? null,
    customerTin: s.customerTin ?? null,
    customerEmail: s.customerEmail ?? null,
    pricesIncludeVat: s.pricesIncludeVat ?? null,
    currency: s.currency ?? null,
    slipGrandTotal: s.slipGrandTotal ?? null,
    slipLinesTotal: sumSlipTotals(
      s.lines.map((l) => ({ ...l, productId: undefined, productName: undefined })) as Parameters<typeof sumSlipTotals>[0]
    ),
    lines: s.lines.map((l) => ({ ...l, productId: l.productId ? String(l.productId) : null })),
    warnings: s.warnings ?? [],
    hasImage: (s.imageBytes ?? 0) > 0,
    createdAt: s.createdAt.toISOString(),
    appliedAt: s.appliedAt ? s.appliedAt.toISOString() : null,
  };
}

/**
 * Store the photo and open a scan in `processing`. The caller then runs `processDespatchScan` in the
 * background. The same photo twice in a branch is refused with the id of the first scan.
 */
export async function createDespatchScan(input: {
  branchId: string;
  tillId?: string | null;
  userId: string;
  image: Buffer;
  mime: string;
}): Promise<{ scanId: string }> {
  await dbConnect();
  if (input.image.length === 0) throw new DespatchScanError("The photo is empty", 400);
  if (input.image.length > MAX_SLIP_IMAGE_BYTES) {
    throw new DespatchScanError("The photo is too large (4 MB limit)", 413);
  }
  let tillId: Types.ObjectId | undefined;
  if (input.tillId) {
    const till = await resolveSaleTill(input.branchId, input.tillId);
    tillId = till ? new Types.ObjectId(input.tillId) : undefined;
  }

  const imageHash = createHash("sha256").update(input.image).digest("hex");
  const branchId = new Types.ObjectId(input.branchId);
  const dup = await DespatchScan.findOne({
    branchId,
    imageHash,
    status: { $in: ["processing", "ready", "applied"] },
  })
    .select("_id")
    .lean<{ _id: Types.ObjectId }>();
  if (dup) throw new DespatchScanError("This photo has already been uploaded", 409, String(dup._id));

  const doc = await DespatchScan.create({
    branchId,
    tillId,
    createdBy: new Types.ObjectId(input.userId),
    status: "processing",
    image: input.image,
    imageMime: input.mime,
    imageBytes: input.image.length,
    imageHash,
    lines: [],
    warnings: [],
  });
  return { scanId: String(doc._id) };
}

/** Read the photo with the AI, clean and match the lines, and move the scan to `ready` (or `failed`). */
export async function processDespatchScan(scanId: string): Promise<void> {
  await dbConnect();
  const scan = await DespatchScan.findById(scanId).select("+image").lean<ScanLean & { image?: Buffer }>();
  if (!scan || scan.status !== "processing" || !scan.image) return;

  try {
    const extracted = await extractDespatchSlip({ image: Buffer.from(scan.image), mime: scan.imageMime });
    const products = await listTerminalProducts(String(scan.branchId));
    const { lines, warnings } = normaliseSlipLines(extracted.items, products);

    const key = slipNumberKey(extracted.slipNumber);
    if (key) {
      const earlier = await DespatchScan.findOne({
        branchId: scan.branchId,
        slipNumberKey: key,
        status: "applied",
        _id: { $ne: scan._id },
      })
        .select("appliedAt")
        .lean<{ appliedAt?: Date }>();
      if (earlier) {
        const when = earlier.appliedAt ? ` on ${earlier.appliedAt.toISOString().slice(0, 10)}` : "";
        warnings.unshift(`Slip ${extracted.slipNumber} was already imported${when}. Check it has not been invoiced already.`);
      }
    } else {
      warnings.push("No slip number could be read, so a repeat of this slip cannot be detected.");
    }

    const linesTotal = sumSlipTotals(lines as Parameters<typeof sumSlipTotals>[0]);
    if (extracted.grandTotal !== null && linesTotal !== null && Math.abs(linesTotal - extracted.grandTotal) > 0.011) {
      warnings.push(
        `The line totals add up to ${linesTotal.toFixed(2)} but the slip's grand total reads ${extracted.grandTotal.toFixed(2)}. ` +
          `A line may have been misread, or the grand total includes VAT or other charges.`
      );
    }

    await DespatchScan.updateOne(
      { _id: scan._id, status: "processing" },
      {
        $set: {
          status: "ready",
          slipNumber: extracted.slipNumber ?? undefined,
          slipNumberKey: key,
          customerName: extracted.customerName ?? undefined,
          customerTin: extracted.customerTin ?? undefined,
          customerEmail: extracted.customerEmail ?? undefined,
          pricesIncludeVat: extracted.pricesIncludeVat,
          currency: extracted.currency,
          slipGrandTotal: extracted.grandTotal,
          lines: lines.map((l) => ({
            ...l,
            productId: l.productId ? new Types.ObjectId(l.productId) : undefined,
          })),
          warnings,
          aiModel: extracted.model,
          inputTokens: extracted.inputTokens,
          outputTokens: extracted.outputTokens,
        },
        $unset: { processingError: "" },
      }
    );
  } catch (err) {
    console.error("Despatch scan failed:", err);
    await DespatchScan.updateOne(
      { _id: scan._id, status: "processing" },
      { $set: { status: "failed", processingError: err instanceof Error ? err.message : "Unknown error" } }
    );
  }
}

/** A scan still "processing" this long after upload lost its background job (timeout, restart): fail it so the phone and till stop waiting. */
const STALE_PROCESSING_MS = 3 * 60_000;
/** The inbox shows scans from this many days back; older ones are left to expire. */
const INBOX_DAYS = 7;

async function failStaleScans(filter: Record<string, unknown>): Promise<void> {
  await DespatchScan.updateMany(
    { ...filter, status: "processing", createdAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    { $set: { status: "failed", processingError: "Reading the slip took too long. Take the photo again." } }
  );
}

/** One scan, limited to `branchId` (null = admin, any branch). Null when it does not exist or is out of scope. */
export async function getDespatchScan(id: string, branchId: string | null): Promise<DespatchScanDto | null> {
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) return null;
  const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };
  if (branchId) filter.branchId = new Types.ObjectId(branchId);
  await failStaleScans(filter);
  const scan = await DespatchScan.findOne(filter).lean<ScanLean>();
  return scan ? toDto(scan) : null;
}

/** The till's inbox: recent scans for a branch (default: those waiting to be imported). */
export async function listDespatchScans(input: {
  branchId: string;
  tillId?: string | null;
  statuses?: IDespatchScan["status"][];
  limit?: number;
}): Promise<DespatchScanDto[]> {
  await dbConnect();
  const filter: Record<string, unknown> = {
    branchId: new Types.ObjectId(input.branchId),
    status: { $in: input.statuses?.length ? input.statuses : ["processing", "ready", "failed"] },
    createdAt: { $gte: new Date(Date.now() - INBOX_DAYS * 24 * 60 * 60 * 1000) },
  };
  await failStaleScans({ branchId: filter.branchId });
  // A scan aimed at one till is shown to that till only; a scan with no till is shown to every till.
  if (input.tillId && Types.ObjectId.isValid(input.tillId)) {
    filter.$or = [{ tillId: new Types.ObjectId(input.tillId) }, { tillId: { $exists: false } }, { tillId: null }];
  }
  const scans = await DespatchScan.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(input.limit ?? 20, 50))
    .lean<ScanLean[]>();
  return scans.map(toDto);
}

/** The stored photo, for the review screen. Limited to `branchId` (null = admin). */
export async function getDespatchScanImage(
  id: string,
  branchId: string | null
): Promise<{ image: Buffer; mime: string } | null> {
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) return null;
  const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };
  if (branchId) filter.branchId = new Types.ObjectId(branchId);
  const scan = await DespatchScan.findOne(filter).select("+image imageMime").lean<{ image?: Buffer; imageMime: string }>();
  if (!scan?.image) return null;
  return { image: Buffer.from(scan.image), mime: scan.imageMime };
}

/**
 * Close a scan once the cashier has dealt with it. "applied" = imported into the cart (the sale id is
 * attached in phase 3 when the sale is raised); "dismissed" = thrown away. Retrying a failed scan is a
 * new upload.
 */
export async function closeDespatchScan(input: {
  id: string;
  branchId: string | null;
  userId: string;
  action: "applied" | "dismissed";
  saleId?: string;
}): Promise<DespatchScanDto> {
  await dbConnect();
  if (!Types.ObjectId.isValid(input.id)) throw new DespatchScanError("Scan not found", 404);
  const filter: Record<string, unknown> = { _id: new Types.ObjectId(input.id) };
  if (input.branchId) filter.branchId = new Types.ObjectId(input.branchId);

  const allowed = input.action === "applied" ? ["ready"] : ["ready", "failed"];
  const set: Record<string, unknown> = { status: input.action };
  if (input.action === "applied") {
    set.appliedAt = new Date();
    set.appliedBy = new Types.ObjectId(input.userId);
    if (input.saleId && Types.ObjectId.isValid(input.saleId)) set.saleId = new Types.ObjectId(input.saleId);
  }
  const updated = await DespatchScan.findOneAndUpdate({ ...filter, status: { $in: allowed } }, { $set: set }, { new: true }).lean<ScanLean>();
  if (!updated) {
    const exists = await DespatchScan.exists(filter);
    throw new DespatchScanError(exists ? "This scan can no longer be changed" : "Scan not found", exists ? 409 : 404);
  }
  return toDto(updated);
}
