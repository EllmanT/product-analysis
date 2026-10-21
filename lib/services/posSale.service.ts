import { formatInTimeZone } from "date-fns-tz";
import { Types } from "mongoose";

import Branch, { type IBranch } from "@/database/branch.model";
import InvoiceCounter from "@/database/invoiceCounter.model";
import ExchangeRate from "@/database/exchangeRate.model";
import PosSale, {
  type IPosBuyer,
  type IPosSaleLine,
  type IPosSale,
  type IPosSaleDoc,
  type PosCurrency,
  type PosPaymentMethod,
} from "@/database/posSale.model";
import logger from "@/lib/logger";
import { checkFiscalMatchesSale, type MatchableSale } from "@/lib/pos/fiscalMatch";
import dbConnect from "@/lib/mongoose";
import {
  CENTRAL_KEY,
  DeviceConfigError,
  deviceKeyForBranch,
  resolveDeviceByKey,
  saleDeviceFilter,
  type ResolvedDevice,
} from "@/lib/services/fiscalDevice.service";
import {
  allocateNumber,
  formatCreditNumber,
  formatInvoiceNumber,
  parseSequence,
  releaseNumber,
  seriesFor,
} from "@/lib/services/posNumbering.service";
import {
  getDeviceInvoice,
  getPosDeviceStatus,
  submitPosReceipt,
  type PosDeviceOutcome,
} from "@/lib/services/zimraPosDevice.service";
import { computeInvoiceTotals, computeLineTotals } from "@/lib/utils/invoiceCalculations";

const TZ = process.env.POS_TIMEZONE?.trim() || "Africa/Harare";
/** A SUBMITTING claim older than this is treated as a crashed request (outcome unknown). */
const STALE_SUBMITTING_MS = 90_000;
/** Device is skipped for this long after a failed attempt so the till does not wait 30 s per sale. */
const BREAKER_NOT_SENT_MS = 30_000;
const BREAKER_UNKNOWN_MS = 10_000;
const MAX_IN_FLIGHT = 3;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;
/** An offline till may legitimately sync after a long outage (offline limit can be "none"). */
const MAX_SOLD_AT_AGE_MS = 30 * 24 * 3_600_000;

export class PosError extends Error {
  constructor(
    message: string,
    public readonly status: number = 422,
    public readonly code: string = "POS_ERROR"
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Small in-process helpers: concurrency limiter + device circuit breaker.
// The device serialises receipts itself (measured ~1.1 s each), so these only keep
// bursts inside the 30 s request timeout and stop us hammering a dead device.
// ---------------------------------------------------------------------------

// Both are kept per fiscal device: one branch device being slow or down must not hold up, or turn
// into provisional slips, the sales of branches that use a different device.

const slots = new Map<string, { inFlight: number; waiters: (() => void)[] }>();

async function withDeviceSlot<T>(deviceKey: string, fn: () => Promise<T>): Promise<T> {
  let s = slots.get(deviceKey);
  if (!s) slots.set(deviceKey, (s = { inFlight: 0, waiters: [] }));
  if (s.inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => s.waiters.push(resolve));
  }
  s.inFlight++;
  try {
    return await fn();
  } finally {
    s.inFlight--;
    s.waiters.shift()?.();
  }
}

const deviceDownUntil = new Map<string, number>();
const breakerOpen = (deviceKey: string) => Date.now() < (deviceDownUntil.get(deviceKey) ?? 0);
const openBreaker = (deviceKey: string, ms: number) => {
  deviceDownUntil.set(deviceKey, Math.max(deviceDownUntil.get(deviceKey) ?? 0, Date.now() + ms));
};
const closeBreaker = (deviceKey: string) => {
  deviceDownUntil.delete(deviceKey);
};

export function todayInTz(now: Date = new Date()): string {
  return formatInTimeZone(now, TZ, "yyyy-MM-dd");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreatePosSaleInput {
  branchId: string;
  cashierId: string;
  idempotencyKey: string;
  currency: PosCurrency;
  paymentMethod?: PosPaymentMethod;
  lines: {
    productId?: string;
    description: string;
    hsCode?: string;
    quantity: number;
    /** Price in the sale currency, VAT-inclusive when the branch is tax-inclusive. */
    unitPrice: number;
  }[];
  buyer?: IPosBuyer;
  notes?: string;
  /** Till clock time of the sale (offline sync). Defaults to now. */
  soldAt?: Date;
  /** Number printed on the provisional slip the till already handed over (offline sync). */
  provisionalNumber?: string;
  offline?: boolean;
  isTest?: boolean;
}

/**
 * Accept a till-issued provisional number only if it has the exact shape we issue and, for the
 * leased P series, is within what the server has actually handed out. A bad or unknown number is
 * simply dropped and the server assigns its own, so a tampered value can never break numbering.
 */
async function acceptableProvisional(
  branchId: Types.ObjectId,
  prefix: string,
  currency: PosCurrency,
  n: string | undefined
): Promise<string | undefined> {
  if (!n) return undefined;
  const letter = currency === "USD" ? "U" : "Z";
  const m = n.match(new RegExp(`^${prefix}${letter}(?:P(\\d{4,9})|Q[A-Z0-9]{3}\\d{4,9})$`));
  if (!m) return undefined;
  if (m[1]) {
    const counter = await InvoiceCounter.findOne({ branchId, series: seriesFor(currency, true) }).select("seq").lean<{ seq: number }>();
    if (!counter || Number(m[1]) > counter.seq) return undefined;
  }
  return n;
}

async function loadPosBranch(branchId: string) {
  if (!Types.ObjectId.isValid(branchId)) throw new PosError("Invalid branch", 400, "BAD_BRANCH");
  const branch = await Branch.findById(branchId).lean<IBranch & { _id: Types.ObjectId }>();
  if (!branch) throw new PosError("Branch not found", 404, "NO_BRANCH");
  if (!branch.pos?.enabled) throw new PosError("Point of sale is not enabled for this branch", 403, "POS_DISABLED");
  if (!branch.pos.invoicePrefix) throw new PosError("This branch has no invoice prefix set", 422, "NO_PREFIX");
  return branch as IBranch & { _id: Types.ObjectId; pos: NonNullable<IBranch["pos"]> };
}

async function currentUsdToZwgRate(): Promise<number> {
  const doc = await ExchangeRate.findOne({ currency: "ZWG", effectiveDate: { $lte: new Date() } })
    .sort({ effectiveDate: -1 })
    .lean<{ rate: number }>();
  return doc?.rate ?? 1;
}

function validateLines(lines: CreatePosSaleInput["lines"]) {
  if (!lines.length) throw new PosError("A sale needs at least one line", 400, "NO_LINES");
  if (lines.length > 200) throw new PosError("Too many lines on one sale", 400, "TOO_MANY_LINES");
  for (const l of lines) {
    if (!l.description?.trim()) throw new PosError("Every line needs a description", 400, "BAD_LINE");
    if (!(l.quantity > 0) || l.quantity > 100_000 || Math.round(l.quantity * 1000) / 1000 !== l.quantity) {
      throw new PosError(`Invalid quantity for "${l.description}"`, 400, "BAD_QTY");
    }
    if (!(l.unitPrice > 0) || l.unitPrice > 1e9 || round2(l.unitPrice) !== l.unitPrice) {
      throw new PosError(`Invalid price for "${l.description}"`, 400, "BAD_PRICE");
    }
  }
}

/**
 * Save a sale and try to fiscalise it. Idempotent on `idempotencyKey`: a retry (double click,
 * lost response, offline sync) returns the original sale and never creates a second one.
 * The caller is responsible for authorising `branchId` (see lib/auth/pos-scope.ts).
 */
export async function createPosSale(input: CreatePosSaleInput): Promise<IPosSaleDoc> {
  await dbConnect();

  const existing = await PosSale.findOne({ idempotencyKey: input.idempotencyKey });
  if (existing) {
    if (String(existing.branchId) !== input.branchId) {
      throw new PosError("Idempotency key already used", 409, "KEY_REUSED");
    }
    return existing;
  }

  const branch = await loadPosBranch(input.branchId);
  validateLines(input.lines);

  const taxPercent = branch.pos.taxPercent;
  const taxCode = branch.pos.taxCode;
  const taxInclusive = branch.pos.taxInclusive;

  const computed = computeLineTotals(
    input.lines.map((l) => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode,
      taxPercent,
      hsCode: l.hsCode,
      lineType: "Sale",
    })),
    taxInclusive
  );
  const totals = computeInvoiceTotals(computed);

  const now = new Date();
  let soldAt = input.soldAt ?? now;
  if (soldAt.getTime() > now.getTime() + 5 * 60_000) soldAt = now; // till clock ahead: clamp
  if (now.getTime() - soldAt.getTime() > MAX_SOLD_AT_AGE_MS) {
    throw new PosError("Sale is too old to sync; contact an administrator", 422, "TOO_OLD");
  }

  const rate = input.currency === "ZWG" ? await currentUsdToZwgRate() : 1;
  const provisionalNumber = await acceptableProvisional(
    new Types.ObjectId(input.branchId),
    branch.pos.invoicePrefix!,
    input.currency,
    input.provisionalNumber
  );

  const doc: Partial<IPosSale> = {
    // The branch's device at this moment, fixed for the life of the sale.
    fiscalDeviceKey: deviceKeyForBranch(branch),
    branchId: new Types.ObjectId(input.branchId),
    cashierId: new Types.ObjectId(input.cashierId),
    idempotencyKey: input.idempotencyKey,
    currency: input.currency,
    exchangeRate: rate,
    taxInclusive,
    paymentMethod: input.paymentMethod ?? "CASH",
    lines: computed.map((l, i) => ({
      lineNo: i + 1,
      productId: input.lines[i].productId ? new Types.ObjectId(input.lines[i].productId) : undefined,
      description: l.description,
      hsCode: l.hsCode,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode ?? taxCode,
      taxPercent: l.taxPercent,
      vatAmount: l.vatAmount,
      lineTotalExcl: l.lineTotalExcl,
      lineTotalIncl: l.lineTotalIncl,
    })),
    subtotalExclTax: totals.subtotalExclTax,
    totalVat: totals.totalVat,
    totalAmount: totals.totalAmount,
    buyer: input.buyer,
    notes: input.notes,
    status: "PENDING",
    soldAt,
    soldDate: todayInTz(soldAt),
    attempts: 0,
    needsApproval: false,
    isTest: input.isTest ?? false,
    offline: input.offline ?? false,
    ...(provisionalNumber ? { provisionalNumber } : {}),
    slipPrintCount: 0,
  };

  let sale: IPosSaleDoc;
  try {
    sale = await PosSale.create(doc);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      const again = await PosSale.findOne({ idempotencyKey: input.idempotencyKey });
      if (again) return again; // lost the race against a simultaneous retry
      if ((e as { keyPattern?: Record<string, unknown> }).keyPattern?.provisionalNumber) {
        // The till's provisional number is already taken by another sale: let the server assign one.
        delete doc.provisionalNumber;
        sale = await PosSale.create(doc);
        return fiscalisePosSale(String(sale._id), { reason: "till" });
      }
    }
    throw e;
  }

  return fiscalisePosSale(String(sale._id), { reason: "till" });
}

// ---------------------------------------------------------------------------
// Fiscalise (state machine)
// ---------------------------------------------------------------------------

export interface FiscaliseOptions {
  reason: "till" | "auto-retry" | "manual" | "reconcile";
  /** Skip the circuit breaker (manual action or a status check just succeeded). */
  force?: boolean;
  /** Admin who approved fiscalising a sale from a previous day. */
  approvedBy?: string;
}

async function ensureProvisionalNumber(sale: IPosSaleDoc, prefix: string): Promise<void> {
  if (sale.provisionalNumber) return;
  const n = await allocateNumber(sale.branchId, seriesFor(sale.currency, true));
  const provisionalNumber = formatInvoiceNumber(prefix, sale.currency, n, true);
  await PosSale.updateOne({ _id: sale._id, provisionalNumber: { $exists: false } }, { $set: { provisionalNumber } });
}

async function dropFiscalNumber(sale: IPosSaleDoc): Promise<void> {
  if (!sale.invoiceNumber) return;
  const n = parseSequence(sale.invoiceNumber);
  await PosSale.updateOne({ _id: sale._id }, { $unset: { invoiceNumber: "" } });
  if (n != null) await releaseNumber(sale.branchId, seriesFor(sale.currency, false, sale.kind === "CREDIT_NOTE"), n);
}

class FiscalMismatchError extends Error {}

/**
 * The only place fiscal data is attached to a sale. It refuses a device receipt that does not
 * match the sale, so a QR for somebody else's invoice can never be stored or printed.
 */
async function markFiscalised(id: Types.ObjectId, fiscal: NonNullable<IPosSale["fiscal"]>) {
  const sale = await PosSale.findById(id).select("invoiceNumber currency totalAmount lines kind").lean<MatchableSale>();
  if (!sale) return null;
  const match = checkFiscalMatchesSale(sale, fiscal);
  if (!match.ok) {
    logger.error({ saleId: String(id), invoiceNumber: sale.invoiceNumber, reason: match.reason }, "Device receipt does not match sale");
    throw new FiscalMismatchError(match.reason);
  }
  return PosSale.findByIdAndUpdate(
    id,
    {
      $set: { status: "FISCALISED", fiscal, fiscalisedAt: new Date(), needsApproval: false },
      $unset: { lastError: "", submittingAt: "" },
    },
    { new: true }
  );
}

/**
 * The device already holds this number for a different receipt. The number is spent for good:
 * it is not released back to the counter, and the sale gets a fresh one.
 */
async function burnNumber(sale: IPosSaleDoc, reason: string): Promise<void> {
  logger.warn({ saleId: String(sale._id), invoiceNumber: sale.invoiceNumber, reason }, "Invoice number belongs to another device receipt; skipping it");
  await PosSale.updateOne({ _id: sale._id }, { $unset: { invoiceNumber: "" } });
  sale.invoiceNumber = undefined;
}

async function settle(
  sale: IPosSaleDoc,
  prefix: string,
  status: "UNFISCALISED" | "UNKNOWN" | "FAILED",
  message: string,
  release: boolean
): Promise<IPosSaleDoc> {
  if (release) await dropFiscalNumber(sale);
  await PosSale.updateOne({ _id: sale._id }, { $set: { status, lastError: message.slice(0, 500) }, $unset: { submittingAt: "" } });
  if (status === "UNFISCALISED") {
    const fresh = (await PosSale.findById(sale._id))!;
    await ensureProvisionalNumber(fresh, prefix);
  }
  return (await PosSale.findById(sale._id))!;
}

/**
 * Try to turn a sale into a fiscal receipt. Safe to call concurrently for the same sale:
 * only one caller wins the atomic claim, the rest get the current state back.
 * Never throws for device problems; the outcome is in `status`.
 */
export async function fiscalisePosSale(saleId: string, opts: FiscaliseOptions): Promise<IPosSaleDoc> {
  await dbConnect();
  const seen = await PosSale.findById(saleId);
  if (!seen) throw new PosError("Sale not found", 404, "NO_SALE");
  if (!["PENDING", "UNFISCALISED", "UNKNOWN"].includes(seen.status)) return seen;

  const branch = await loadPosBranch(String(seen.branchId));
  const prefix = branch.pos.invoicePrefix!;

  // Sales from an earlier day must not silently shift into today's fiscal day.
  if (seen.soldDate !== todayInTz() && !opts.approvedBy) {
    if (!seen.needsApproval) await PosSale.updateOne({ _id: seen._id }, { $set: { needsApproval: true } });
    if (seen.status === "PENDING") {
      // e.g. an offline sale synced the next day: keep it visible, numbered and waiting for an administrator.
      return settle(seen, prefix, "UNFISCALISED", "Sale is from an earlier day; an administrator must approve fiscalising it", false);
    }
    return (await PosSale.findById(saleId))!;
  }

  // The sale's own device, fixed when it was created. Older sales have none and used the central device.
  const deviceKey = seen.fiscalDeviceKey || CENTRAL_KEY;

  // Fast path while the device is known to be down: hand the till a provisional slip at once.
  if (breakerOpen(deviceKey) && !opts.force && seen.status === "PENDING") {
    return settle(seen, prefix, "UNFISCALISED", "Fiscal device unavailable; queued for retry", false);
  }

  const claimed = await PosSale.findOneAndUpdate(
    { _id: seen._id, status: seen.status },
    {
      $set: {
        status: "SUBMITTING",
        submittingAt: new Date(),
        ...(opts.approvedBy ? { approvedBy: new Types.ObjectId(opts.approvedBy), needsApproval: false } : {}),
      },
      $inc: { attempts: 1 },
    },
    { new: true }
  );
  if (!claimed) return (await PosSale.findById(saleId))!; // another worker has it

  try {
    let device: ResolvedDevice;
    try {
      device = await resolveDeviceByKey(deviceKey);
    } catch (e) {
      // The branch's device is missing, switched off or incomplete. Never fall back to another device.
      if (!(e instanceof DeviceConfigError)) throw e;
      return settle(claimed, prefix, "UNFISCALISED", `Fiscal device not available: ${e.message}`, false);
    }

    // A sale that might already be on the device is checked first, never blindly resubmitted.
    if (claimed.invoiceNumber && (seen.status === "UNKNOWN" || seen.status === "UNFISCALISED")) {
      try {
        const found = await getDeviceInvoice(claimed.invoiceNumber, device);
        if (found.found) {
          const m = checkFiscalMatchesSale(claimed, found.fiscal);
          if (m.ok) {
            closeBreaker(deviceKey);
            return (await markFiscalised(claimed._id, found.fiscal))!;
          }
          await burnNumber(claimed, m.reason); // someone else's receipt: take a new number below
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        openBreaker(deviceKey, BREAKER_UNKNOWN_MS);
        return settle(claimed, prefix, "UNKNOWN", `Could not confirm with device: ${msg}`, false);
      }
    }

    const notes = [claimed.provisionalNumber ? `Ref provisional ${claimed.provisionalNumber}` : "", claimed.notes ?? ""]
      .filter(Boolean)
      .join(" | ");

    let creditNote: { refDeviceId: string; refReceiptGlobalNo: string; refFiscalDay: string } | undefined;
    if (claimed.kind === "CREDIT_NOTE") {
      const original = claimed.originalSaleId ? await PosSale.findById(claimed.originalSaleId).select("fiscal").lean<{ fiscal?: IPosSale["fiscal"] }>() : null;
      const f = original?.fiscal;
      if (!f?.receiptGlobalNo || f.fiscalDayNo == null || !f.deviceId) {
        return settle(claimed, prefix, "FAILED", "The original receipt has no fiscal reference to credit", true);
      }
      creditNote = { refDeviceId: f.deviceId, refReceiptGlobalNo: f.receiptGlobalNo, refFiscalDay: String(f.fiscalDayNo) };
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      let invoiceNumber = claimed.invoiceNumber;
      if (!invoiceNumber) {
        const credit = claimed.kind === "CREDIT_NOTE";
        const n = await allocateNumber(claimed.branchId, seriesFor(claimed.currency, false, credit));
        invoiceNumber = credit ? formatCreditNumber(prefix, claimed.currency, n) : formatInvoiceNumber(prefix, claimed.currency, n, false);
        await PosSale.updateOne({ _id: claimed._id }, { $set: { invoiceNumber } });
        claimed.invoiceNumber = invoiceNumber;
      }

      const outcome: PosDeviceOutcome = await withDeviceSlot(deviceKey, () =>
        submitPosReceipt(
          {
            creditNote,
            invoiceNumber,
            currency: claimed.currency,
            totalAmount: claimed.totalAmount,
            totalVat: claimed.totalVat,
            taxInclusive: claimed.taxInclusive,
            paymentMethod: claimed.paymentMethod,
            notes,
            buyer: claimed.buyer ?? undefined,
            lines: claimed.lines,
          },
          device
        )
      );

      switch (outcome.kind) {
        case "ok":
          closeBreaker(deviceKey);
          try {
            return (await markFiscalised(claimed._id, outcome.fiscal))!;
          } catch (e) {
            if (!(e instanceof FiscalMismatchError)) throw e;
            // The device signed something that is not this sale: keep the QR off the slip, flag it.
            return settle(claimed, prefix, "FAILED", `Fiscal receipt mismatch: ${e.message}. Do not hand out a slip; contact support.`, false);
          }

        case "rejected":
          if (outcome.reason === "duplicate") {
            // The device already holds this number: either an earlier attempt of THIS sale landed,
            // or the number belongs to an older receipt. Only the first may reuse the device's QR.
            try {
              const found = await getDeviceInvoice(invoiceNumber, device);
              if (found.found) {
                const m = checkFiscalMatchesSale(claimed, found.fiscal);
                if (m.ok) return (await markFiscalised(claimed._id, found.fiscal))!;
                await burnNumber(claimed, m.reason);
                continue; // submit again under a fresh number
              }
            } catch {
              /* fall through to UNKNOWN */
            }
            return settle(claimed, prefix, "UNKNOWN", outcome.message, false);
          }
          if (outcome.reason === "validation") {
            return settle(claimed, prefix, "FAILED", outcome.message, true);
          }
          // day closed, or a refusal we do not recognise: never lose the sale
          return settle(claimed, prefix, "UNFISCALISED", outcome.message, true);

        case "not_sent":
          openBreaker(deviceKey, BREAKER_NOT_SENT_MS);
          return settle(claimed, prefix, "UNFISCALISED", outcome.message, true);

        case "unknown":
          openBreaker(deviceKey, BREAKER_UNKNOWN_MS);
          return settle(claimed, prefix, "UNKNOWN", outcome.message, false);
      }
    }
    return settle(claimed, prefix, "UNFISCALISED", "Device keeps returning used invoice numbers; will retry", false);
  } catch (e) {
    // Unexpected local failure after the claim: keep the sale recoverable.
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ saleId, err: msg }, "POS fiscalise crashed");
    const fresh = (await PosSale.findById(saleId))!;
    return settle(fresh, prefix, fresh.invoiceNumber ? "UNKNOWN" : "UNFISCALISED", msg, false);
  }
}

// ---------------------------------------------------------------------------
// Background work (called by the cron route)
// ---------------------------------------------------------------------------

export interface PosQueueDeviceResult {
  key: string;
  name: string;
  reachable: boolean;
  dayOpen: boolean | null;
  attempted: number;
  fiscalised: number;
  stillPending: number;
  message?: string;
}

export interface PosQueueRunResult {
  /** True only when every device that was checked answered. */
  deviceReachable: boolean;
  /** Day state of the central device (or of the one device checked). */
  dayOpen: boolean | null;
  reclaimedStale: number;
  attempted: number;
  fiscalised: number;
  stillPending: number;
  needApproval: number;
  devices: PosQueueDeviceResult[];
}

const OPEN_STATES = ["UNFISCALISED", "UNKNOWN"];

/** Retry one device's sales. A dead device only affects its own branches. */
async function runQueueForDevice(deviceKey: string, limit: number, today: string): Promise<PosQueueDeviceResult> {
  const filter = saleDeviceFilter(deviceKey);
  const pendingCount = () => PosSale.countDocuments({ ...filter, status: { $in: OPEN_STATES } });

  let device: ResolvedDevice;
  try {
    device = await resolveDeviceByKey(deviceKey);
  } catch (e) {
    return {
      key: deviceKey,
      name: deviceKey,
      reachable: false,
      dayOpen: null,
      attempted: 0,
      fiscalised: 0,
      stillPending: await pendingCount(),
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const out: PosQueueDeviceResult = {
    key: deviceKey,
    name: device.name,
    reachable: false,
    dayOpen: null,
    attempted: 0,
    fiscalised: 0,
    stillPending: 0,
  };

  const status = await getPosDeviceStatus(device);
  out.reachable = status.reachable;
  out.dayOpen = status.dayOpen;
  if (!status.reachable) {
    openBreaker(deviceKey, BREAKER_NOT_SENT_MS);
    out.message = status.message;
    out.stillPending = await pendingCount();
    return out;
  }
  closeBreaker(deviceKey);

  // UNKNOWN sales can be reconciled even when the day is closed (GetInvoice only reads).
  const candidates = await PosSale.find({
    ...filter,
    status: { $in: status.dayOpen ? ["UNKNOWN", "UNFISCALISED"] : ["UNKNOWN"] },
    soldDate: today,
    needsApproval: false,
  })
    .sort({ soldAt: 1 })
    .limit(limit * 4);

  const now = Date.now();
  for (const sale of candidates) {
    if (out.attempted >= limit) break;
    const wait = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, sale.attempts - 1), RETRY_MAX_MS);
    const last = (sale as unknown as { updatedAt?: Date }).updatedAt?.getTime() ?? 0;
    if (now - last < wait) continue;
    out.attempted++;
    const after = await fiscalisePosSale(String(sale._id), { reason: "auto-retry", force: true });
    if (after.status === "FISCALISED") out.fiscalised++;
  }

  out.stillPending = await pendingCount();
  return out;
}

/**
 * 1. SUBMITTING claims that died become UNKNOWN.
 * 2. Older-day sales are flagged for admin approval (never auto-fiscalised).
 * 3. For each fiscal device: if it is reachable and the day is open, reconcile UNKNOWN sales
 *    (GetInvoice first) and retry UNFISCALISED sales from today, with exponential backoff.
 *
 * Without `deviceKey` every device is processed: the central one always, the others when they
 * have sales waiting. Devices run independently, so one being down never blocks another.
 */
export async function runPosQueue(limit = 25, opts: { deviceKey?: string } = {}): Promise<PosQueueRunResult> {
  await dbConnect();

  const stale = await PosSale.updateMany(
    { status: "SUBMITTING", submittingAt: { $lt: new Date(Date.now() - STALE_SUBMITTING_MS) } },
    { $set: { status: "UNKNOWN", lastError: "Request interrupted; awaiting reconciliation" }, $unset: { submittingAt: "" } }
  );

  const today = todayInTz();
  await PosSale.updateMany(
    { status: { $in: OPEN_STATES }, soldDate: { $lt: today }, needsApproval: false },
    { $set: { needsApproval: true } }
  );
  const scope = opts.deviceKey ? saleDeviceFilter(opts.deviceKey) : {};
  const needApproval = await PosSale.countDocuments({ ...scope, status: { $in: OPEN_STATES }, needsApproval: true });

  let keys: string[];
  if (opts.deviceKey) {
    keys = [opts.deviceKey];
  } else {
    const others = (
      await PosSale.distinct("fiscalDeviceKey", { status: { $in: OPEN_STATES }, soldDate: today, needsApproval: false })
    ).filter((k): k is string => typeof k === "string" && k !== CENTRAL_KEY);
    keys = [CENTRAL_KEY, ...others];
  }

  const settled = await Promise.allSettled(keys.map((k) => runQueueForDevice(k, limit, today)));
  const devices = settled.map((r, i): PosQueueDeviceResult =>
    r.status === "fulfilled"
      ? r.value
      : {
          key: keys[i],
          name: keys[i],
          reachable: false,
          dayOpen: null,
          attempted: 0,
          fiscalised: 0,
          stillPending: 0,
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        }
  );

  return {
    deviceReachable: devices.every((d) => d.reachable),
    dayOpen: (devices.find((d) => d.key === CENTRAL_KEY) ?? devices[0])?.dayOpen ?? null,
    reclaimedStale: stale.modifiedCount,
    attempted: devices.reduce((n, d) => n + d.attempted, 0),
    fiscalised: devices.reduce((n, d) => n + d.fiscalised, 0),
    stillPending: devices.reduce((n, d) => n + d.stillPending, 0),
    needApproval,
    devices,
  };
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

/** Cancel a sale that was never fiscalised. Fiscalised sales need a credit note instead. */
export async function voidPosSale(saleId: string): Promise<IPosSaleDoc> {
  await dbConnect();
  const sale = await PosSale.findById(saleId);
  if (!sale) throw new PosError("Sale not found", 404, "NO_SALE");
  if (sale.status === "VOIDED") return sale;
  if (sale.status === "FISCALISED") throw new PosError("Fiscalised sales cannot be voided; issue a credit note", 409, "FISCALISED");
  if (sale.status === "SUBMITTING") throw new PosError("Sale is being submitted, try again shortly", 409, "BUSY");

  if (sale.invoiceNumber) {
    // It may have reached the device. Check before cancelling.
    let found: Awaited<ReturnType<typeof getDeviceInvoice>>;
    try {
      // Ask the device that numbered it, not whichever device the branch uses now.
      found = await getDeviceInvoice(sale.invoiceNumber, await resolveDeviceByKey(sale.fiscalDeviceKey));
    } catch {
      throw new PosError("Cannot confirm with the fiscal device right now; try again later", 503, "DEVICE_UNREACHABLE");
    }
    if (found.found && checkFiscalMatchesSale(sale, found.fiscal).ok) {
      await markFiscalised(sale._id, found.fiscal);
      throw new PosError("This sale was already fiscalised on the device", 409, "FISCALISED");
    }
    await dropFiscalNumber(sale);
  }
  await PosSale.updateOne({ _id: sale._id }, { $set: { status: "VOIDED", needsApproval: false } });
  if (sale.kind === "CREDIT_NOTE" && sale.originalSaleId) {
    await PosSale.updateOne({ _id: sale.originalSaleId }, { $unset: { creditNoteId: "" } });
  }
  return (await PosSale.findById(saleId))!;
}

// ---------------------------------------------------------------------------
// Credit notes
// ---------------------------------------------------------------------------

/**
 * Reverse a fiscalised sale in full with a fiscal credit note (own series, e.g. HUC0001).
 * Only one credit note can exist per sale: the original is claimed atomically before anything
 * is created, so two supervisors clicking at once cannot refund it twice.
 */
export async function issueCreditNote(originalId: string, actorUserId: string, reason?: string): Promise<IPosSaleDoc> {
  await dbConnect();
  if (!Types.ObjectId.isValid(originalId)) throw new PosError("Sale not found", 404, "NO_SALE");

  const cnId = new Types.ObjectId();
  const original = await PosSale.findOneAndUpdate(
    {
      _id: originalId,
      status: "FISCALISED",
      kind: { $ne: "CREDIT_NOTE" },
      creditNoteId: { $exists: false },
    },
    { $set: { creditNoteId: cnId } },
    { new: true }
  );
  if (!original) {
    const seen = await PosSale.findById(originalId).select("status kind creditNoteId").lean<{ status: string; kind?: string; creditNoteId?: Types.ObjectId }>();
    if (!seen) throw new PosError("Sale not found", 404, "NO_SALE");
    if (seen.kind === "CREDIT_NOTE") throw new PosError("A credit note cannot be credited", 409, "IS_CREDIT");
    if (seen.creditNoteId) throw new PosError("This sale already has a credit note", 409, "ALREADY_CREDITED");
    throw new PosError("Only a fiscalised sale can be credited", 409, "NOT_FISCALISED");
  }

  const neg = (n: number) => (n === 0 ? 0 : -n);
  try {
    await loadPosBranch(String(original.branchId));
    await PosSale.create({
      _id: cnId,
      kind: "CREDIT_NOTE",
      originalSaleId: original._id,
      originalNumber: original.invoiceNumber,
      creditReason: reason?.trim() || undefined,
      // A credit note must reach the device that signed the original receipt.
      fiscalDeviceKey: original.fiscalDeviceKey || CENTRAL_KEY,
      branchId: original.branchId,
      cashierId: new Types.ObjectId(actorUserId),
      idempotencyKey: `cn:${cnId}`,
      currency: original.currency,
      exchangeRate: original.exchangeRate,
      taxInclusive: original.taxInclusive,
      paymentMethod: original.paymentMethod,
      lines: original.lines.map((l: IPosSaleLine) => ({
        lineNo: l.lineNo,
        productId: l.productId,
        description: l.description,
        hsCode: l.hsCode,
        quantity: neg(l.quantity),
        unitPrice: l.unitPrice,
        taxCode: l.taxCode,
        taxPercent: l.taxPercent,
        vatAmount: neg(l.vatAmount),
        lineTotalExcl: neg(l.lineTotalExcl),
        lineTotalIncl: neg(l.lineTotalIncl),
      })),
      subtotalExclTax: neg(original.subtotalExclTax),
      totalVat: neg(original.totalVat),
      totalAmount: neg(original.totalAmount),
      buyer: original.buyer,
      notes: reason?.trim() ? `Credit note: ${reason.trim()}`.slice(0, 300) : undefined,
      status: "PENDING",
      soldAt: new Date(),
      soldDate: todayInTz(),
      attempts: 0,
      needsApproval: false,
      isTest: original.isTest,
      slipPrintCount: 0,
    });
  } catch (e) {
    await PosSale.updateOne({ _id: original._id, creditNoteId: cnId }, { $unset: { creditNoteId: "" } });
    throw e;
  }

  const cn = await fiscalisePosSale(String(cnId), { reason: "till" });
  if (cn.status === "FAILED") {
    // The device refused it: free the original so it can be tried again.
    await PosSale.updateOne({ _id: original._id, creditNoteId: cnId }, { $unset: { creditNoteId: "" } });
  }
  return cn;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface PosSummaryRow {
  currency: PosCurrency;
  fiscalised: { count: number; total: number; vat: number };
  /** Fiscal credit notes (negative amounts). Not included in `fiscalised`. */
  credit: { count: number; total: number };
  pending: { count: number; total: number };
  failed: number;
  voided: number;
}

/** Per-currency totals for one branch (or all branches when `branchId` is omitted) on one date. */
export async function getPosSummary(opts: {
  branchId?: string;
  date?: string;
  includeTest?: boolean;
}): Promise<PosSummaryRow[]> {
  await dbConnect();
  const match: Record<string, unknown> = { soldDate: opts.date ?? todayInTz() };
  if (opts.branchId) match.branchId = new Types.ObjectId(opts.branchId);
  if (!opts.includeTest) match.isTest = { $ne: true };

  const rows = await PosSale.aggregate<{
    _id: { currency: PosCurrency; status: string; credit: boolean };
    count: number;
    total: number;
    vat: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: { currency: "$currency", status: "$status", credit: { $eq: ["$kind", "CREDIT_NOTE"] } },
        count: { $sum: 1 },
        total: { $sum: "$totalAmount" },
        vat: { $sum: "$totalVat" },
      },
    },
  ]);

  const out: Record<PosCurrency, PosSummaryRow> = {
    USD: { currency: "USD", fiscalised: { count: 0, total: 0, vat: 0 }, credit: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, failed: 0, voided: 0 },
    ZWG: { currency: "ZWG", fiscalised: { count: 0, total: 0, vat: 0 }, credit: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, failed: 0, voided: 0 },
  };
  for (const r of rows) {
    const o = out[r._id.currency];
    if (!o) continue;
    if (r._id.status === "FISCALISED" && r._id.credit) o.credit = { count: r.count, total: round2(r.total) };
    else if (r._id.status === "FISCALISED") o.fiscalised = { count: r.count, total: round2(r.total), vat: round2(r.vat) };
    else if (["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"].includes(r._id.status)) {
      o.pending.count += r.count;
      o.pending.total = round2(o.pending.total + r.total);
    } else if (r._id.status === "FAILED") o.failed += r.count;
    else if (r._id.status === "VOIDED") o.voided += r.count;
  }
  return [out.USD, out.ZWG];
}
