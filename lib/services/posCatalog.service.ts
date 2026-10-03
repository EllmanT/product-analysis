import { Types } from "mongoose";

import ExchangeRate from "@/database/exchangeRate.model";
import PosProduct from "@/database/posProduct.model";
import Upload from "@/database/upload.model";
import UploadProduct from "@/database/uploadproduct.model";
import dbConnect from "@/lib/mongoose";

export interface TerminalProduct {
  id: string;
  name: string;
  code: string;
  hsCode: string;
  priceUsd: number;
  priceZwg: number | null;
  priceOnEntry: boolean;
}

/** USD -> ZWG rate in force now (1 when none is configured). */
export async function currentZwgRate(): Promise<number> {
  await dbConnect();
  const doc = await ExchangeRate.findOne({ currency: "ZWG", effectiveDate: { $lte: new Date() } })
    .sort({ effectiveDate: -1 })
    .lean<{ rate: number }>();
  return doc?.rate ?? 1;
}

/** Active products a till can sell: its own branch's plus the global ones. */
export async function listTerminalProducts(branchId: string): Promise<TerminalProduct[]> {
  await dbConnect();
  const docs = await PosProduct.find({
    isActive: true,
    $or: [{ branchId: new Types.ObjectId(branchId) }, { branchId: { $exists: false } }, { branchId: null }],
  })
    .sort({ name: 1 })
    .limit(20_000)
    .lean<
      {
        _id: Types.ObjectId;
        branchId?: Types.ObjectId;
        name: string;
        code?: string;
        hsCode?: string;
        priceUsd: number;
        priceZwg?: number;
        priceOnEntry: boolean;
      }[]
    >();

  // A branch product with the same name as a global one wins.
  const byName = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    const key = d.name.toLowerCase();
    const cur = byName.get(key);
    if (!cur || (d.branchId && !cur.branchId)) byName.set(key, d);
  }
  return [...byName.values()].map((d) => ({
    id: String(d._id),
    name: d.name,
    code: d.code ?? "",
    hsCode: d.hsCode ?? "",
    priceUsd: d.priceUsd,
    priceZwg: d.priceZwg ?? null,
    priceOnEntry: d.priceOnEntry,
  }));
}

export interface StockImportResult {
  created: number;
  updated: number;
  skippedExisting: number;
  considered: number;
  uploadDate: Date;
  fileName: string | null;
}

export class StockImportError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

const IMPORT_CHUNK = 1000;

/**
 * Fill a branch's POS product list from its most recent stock upload: name, code and price of every
 * line. Existing POS products keep their prices unless `overwritePrices` is set. Upload prices are
 * taken as USD.
 */
export async function importStockToPos(
  branchId: string,
  opts: { overwritePrices?: boolean; includeOutOfStock?: boolean } = {}
): Promise<StockImportResult> {
  await dbConnect();
  const branch = new Types.ObjectId(branchId);
  const upload = await Upload.findOne({ branchId: branch, status: { $in: ["complete", null] } })
    .sort({ upload_date: -1, createdAt: -1 })
    .select("upload_date fileName")
    .lean<{ _id: Types.ObjectId; upload_date: Date; fileName?: string }>();
  if (!upload) throw new StockImportError("This branch has no stock upload yet", 404);

  const lines = await UploadProduct.find({
    uploadId: upload._id,
    ...(opts.includeOutOfStock ? {} : { qty: { $gt: 0 } }),
  })
    .select("name code price")
    .lean<{ name: string; code: string; price: { toString(): string } }[]>();

  // One entry per product name (the list is unique per branch and name); skip anything without a usable price.
  const byName = new Map<string, { name: string; code: string; priceUsd: number }>();
  for (const l of lines) {
    const name = l.name?.trim();
    const price = Math.round(Number(l.price?.toString()) * 100) / 100;
    if (!name || !(price > 0) || price > 1e9) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: name.slice(0, 200), code: String(l.code ?? "").slice(0, 60), priceUsd: price });
  }
  const items = [...byName.values()];
  if (items.length === 0) throw new StockImportError("The latest upload has no priced products to import", 422);

  const overwrite = opts.overwritePrices === true;
  let created = 0;
  let updated = 0;
  for (let i = 0; i < items.length; i += IMPORT_CHUNK) {
    const result = await PosProduct.bulkWrite(
      items.slice(i, i + IMPORT_CHUNK).map((it) => ({
        updateOne: {
          filter: { branchId: branch, name: it.name },
          update: overwrite
            ? { $set: { code: it.code, priceUsd: it.priceUsd }, $setOnInsert: { priceOnEntry: false, isActive: true } }
            : { $setOnInsert: { code: it.code, priceUsd: it.priceUsd, priceOnEntry: false, isActive: true } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    created += result.upsertedCount;
    updated += result.modifiedCount;
  }
  return {
    created,
    updated,
    skippedExisting: overwrite ? 0 : items.length - created,
    considered: items.length,
    uploadDate: upload.upload_date,
    fileName: upload.fileName ?? null,
  };
}
