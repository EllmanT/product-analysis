import { formatInTimeZone } from "date-fns-tz";
import { Types } from "mongoose";

import Branch, { type IBranch } from "@/database/branch.model";
import DespatchScan from "@/database/despatchScan.model";
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
import { FiscalServiceUnavailable, engineStatus, fiscalBackend, getReceipt, submitReceipt } from "@/lib/fiscal/client";
import { buildServiceRequest, isRetryableProblem, toPosFiscal } from "@/lib/fiscal/serviceMapping";
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
  resolveServiceDeviceId,
} from "@/lib/services/fiscalDevice.service";
import {
  allocateNumber,
  formatCreditNumber,
  formatInvoiceNumber,
  parseSequence,
  releaseNumber,
  seriesFor,
} from "@/lib/services/posNumbering.service";
import { sendPendingInvoiceEmails } from "@/lib/services/posInvoiceEmail.service";
import { resolveSaleTill, TillError } from "@/lib/services/posTill.service";
import { isFenced } from "@/lib/services/fiscalDayControl.service";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";
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
  /** Which till made the sale (optional). Must belong to the branch. */
  tillId?: string;
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
  /** Build-from-photo: the scan these lines came from. The slip number is taken from the scan, never from the caller. */
  source?: { scanId: string };
  /** Email the A4 tax invoice (PDF) to the buyer once fiscalised. Needs the buyer's name and email. */
  emailInvoice?: boolean;
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
/**
 * Check a slip scan may become a sale: it is this branch's, it has been read, and no live sale
 * already came from it or from a slip with the same number. Voided and failed sales do not count.
 */
async function resolveSlipSource(branchId: string, scanId: string): Promise<NonNullable<IPosSale["source"]>> {
  if (!Types.ObjectId.isValid(scanId)) throw new PosError("That slip scan was not found", 422, "BAD_SOURCE");
  const scan = await DespatchScan.findOne({ _id: new Types.ObjectId(scanId), branchId: new Types.ObjectId(branchId) })
    .select("status slipNumber slipNumberKey")
    .lean<{ _id: Types.ObjectId; status: string; slipNumber?: string; slipNumberKey?: string }>();
  if (!scan) throw new PosError("That slip scan was not found", 422, "BAD_SOURCE");
  if (scan.status === "applied") {
    throw new PosError(`This slip${scan.slipNumber ? ` (${scan.slipNumber})` : ""} has already been invoiced.`, 409, "DUPLICATE_SLIP");
  }
  if (scan.status !== "ready") throw new PosError("That slip scan is no longer available. Scan it again.", 422, "BAD_SOURCE");
  const dup = await PosSale.findOne({
    branchId: new Types.ObjectId(branchId),
    status: { $nin: ["VOIDED", "FAILED"] },
    $or: [{ "source.scanId": scan._id }, ...(scan.slipNumberKey ? [{ "source.slipNumberKey": scan.slipNumberKey }] : [])],
  })
    .select("invoiceNumber provisionalNumber")
    .lean<{ invoiceNumber?: string; provisionalNumber?: string }>();
  if (dup) {
    const ref = dup.invoiceNumber ?? dup.provisionalNumber;
    throw new PosError(
      `This slip${scan.slipNumber ? ` (${scan.slipNumber})` : ""} has already been invoiced${ref ? ` as ${ref}` : ""}.`,
      409,
      "DUPLICATE_SLIP"
    );
  }
  return { kind: "despatch_scan", scanId: scan._id, slipNumber: scan.slipNumber, slipNumberKey: scan.slipNumberKey };
}

/**
 * Take the scan before the sale is created. Only one request can win this update, so two tills
 * (or a double click) can never both invoice the same slip.
 */
async function claimScan(scanId: Types.ObjectId, cashierId: string): Promise<void> {
  const r = await DespatchScan.updateOne(
    { _id: scanId, status: "ready" },
    { $set: { status: "applied", appliedAt: new Date(), appliedBy: new Types.ObjectId(cashierId) } }
  );
  if (r.modifiedCount === 0) throw new PosError("This slip has already been invoiced.", 409, "DUPLICATE_SLIP");
}

/** The sale could not be created: put the slip back in the inbox. */
async function releaseScan(scanId: Types.ObjectId): Promise<void> {
  try {
    await DespatchScan.updateOne(
      { _id: scanId, status: "applied", saleId: { $exists: false } },
      { $set: { status: "ready" }, $unset: { appliedAt: "", appliedBy: "" } }
    );
  } catch (e) {
    logger.error({ err: e, scanId: String(scanId) }, "Could not release despatch scan");
  }
}

/** Record which sale a claimed scan became. Best effort: the sale is already saved. */
async function linkScanToSale(scanId: Types.ObjectId, saleId: unknown): Promise<void> {
  try {
    await DespatchScan.updateOne({ _id: scanId, status: "applied" }, { $set: { saleId } });
  } catch (e) {
    logger.error({ err: e, scanId: String(scanId) }, "Could not link despatch scan to its sale");
  }
}

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
  const source = input.source ? await resolveSlipSource(input.branchId, input.source.scanId) : undefined;
  if (input.emailInvoice && (!input.buyer?.registerName?.trim() || !/^\S+@\S+\.\S+$/.test(input.buyer?.email?.trim() ?? ""))) {
    throw new PosError("To email the invoice, enter the customer's name and a valid email address.", 422, "EMAIL_NEEDS_CUSTOMER");
  }
  // ZIMRA refuses a receipt that names a customer without an email or phone number, after the customer has already
  // left with a slip. Ask for it at the till instead.
  if (fiscalBackend() === "service") {
    const b = input.buyer;
    const named = !!b && [b.registerName, b.tradeName, b.tin, b.vatNumber, b.address, b.city].some((v) => typeof v === "string" && v.trim());
    if (named && !b!.email?.trim() && !b!.phone?.trim()) {
      throw new PosError("A customer on a fiscal invoice needs an email address or a phone number. Add one, or clear the customer details for a cash sale.", 422, "BUYER_CONTACT_REQUIRED");
    }
  }

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

  let till: Awaited<ReturnType<typeof resolveSaleTill>>;
  try {
    till = await resolveSaleTill(input.branchId, input.tillId);
  } catch (e) {
    if (e instanceof TillError) throw new PosError(e.message, e.status, "BAD_TILL");
    throw e;
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
    ...(till ? { tillId: till.tillId, tillCode: till.tillCode } : {}),
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
    ...(source ? { source } : {}),
    ...(input.emailInvoice
      ? { emailRequest: { to: input.buyer!.email!.trim(), status: "pending" as const, requestedAt: now, attempts: 0 } }
      : {}),
  };

  if (source) await claimScan(source.scanId, input.cashierId);

  let sale: IPosSaleDoc;
  try {
    sale = await PosSale.create(doc);
    if (source) await linkScanToSale(source.scanId, sale._id);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      const again = await PosSale.findOne({ idempotencyKey: input.idempotencyKey });
      if (again) return again; // lost the race against a simultaneous retry
      if ((e as { keyPattern?: Record<string, unknown> }).keyPattern?.provisionalNumber) {
        // The till's provisional number is already taken by another sale: let the server assign one.
        delete doc.provisionalNumber;
        sale = await PosSale.create(doc);
        if (source) await linkScanToSale(source.scanId, sale._id);
        return fiscalisePosSale(String(sale._id), { reason: "till" });
      }
    }
    if (source) await releaseScan(source.scanId);
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
      $set: { status: "FISCALISED", fiscal, fiscalisedAt: new Date(), needsApproval: false, needsReview: false },
      $unset: { lastError: "", submittingAt: "", reviewNote: "" },
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
 * FISCAL_BACKEND=service: hand the claimed sale to the fiscal service. The service numbers, orders, retries and
 * stores it, and answers the same way to the same invoice number, so a retry is just the same call again:
 * there is no GetInvoice dance and no breaker here. Never throws for service problems; the outcome is in `status`.
 */
async function fiscaliseViaService(claimed: IPosSaleDoc, prefix: string, deviceKey: string): Promise<IPosSaleDoc> {
  let serviceDeviceId: string;
  try {
    serviceDeviceId = await resolveServiceDeviceId(deviceKey);
  } catch (e) {
    if (!(e instanceof DeviceConfigError)) throw e;
    return settle(claimed, prefix, "UNFISCALISED", `Fiscal device not available: ${e.message}`, false);
  }

  if (claimed.kind === "CREDIT_NOTE" && !claimed.originalNumber) {
    return settle(claimed, prefix, "FAILED", "The original receipt has no invoice number to credit", false);
  }
  if (!claimed.invoiceNumber) {
    const credit = claimed.kind === "CREDIT_NOTE";
    const n = await allocateNumber(claimed.branchId, seriesFor(claimed.currency, false, credit));
    claimed.invoiceNumber = credit ? formatCreditNumber(prefix, claimed.currency, n) : formatInvoiceNumber(prefix, claimed.currency, n, false);
    await PosSale.updateOne({ _id: claimed._id }, { $set: { invoiceNumber: claimed.invoiceNumber } });
  }

  let result;
  try {
    result = await submitReceipt(serviceDeviceId, buildServiceRequest(claimed, process.env.INVOICE_DEFAULT_HS_CODE ?? "00000000"));
  } catch (e) {
    if (!(e instanceof FiscalServiceUnavailable)) throw e;
    // The request may or may not have arrived; sending it again is safe (same invoice number, same answer).
    return settle(claimed, prefix, "UNFISCALISED", `Fiscal service unavailable: ${e.message}`, false);
  }

  if (result.status === "fiscalised") {
    try {
      return (await markFiscalised(claimed._id, toPosFiscal(result, claimed)))!;
    } catch (e) {
      if (!(e instanceof FiscalMismatchError)) throw e;
      return settle(claimed, prefix, "FAILED", `Fiscal receipt mismatch: ${e.message}. Do not hand out a slip; contact support.`, false);
    }
  }

  if (result.status === "queued") {
    // Numbered and signed already; ZIMRA has not answered yet. The slip is valid, delivery continues in the service.
    return settle(claimed, prefix, "UNFISCALISED", result.reason || "Receipt queued in the fiscal service", false);
  }

  const problem = result.problems?.[0] ?? { code: "REFUSED", message: "The fiscal service refused the receipt" };
  if (isRetryableProblem(problem.code)) {
    return settle(claimed, prefix, "UNFISCALISED", problem.message, false);
  }
  // The service refused it before it used a receipt number, because it would break a ZIMRA rule. A person must look.
  await PosSale.updateOne({ _id: claimed._id }, { $set: { needsReview: true, reviewNote: `${problem.code}: ${problem.message}`.slice(0, 500) } });
  void sendFiscalAlertOnce(
    `receipt-refused:${String(claimed._id)}`,
    "A receipt was refused by the fiscal service",
    `Sale ${claimed.invoiceNumber} was refused (${problem.code}) and needs review.\n\nReason: ${problem.message}\n\nThe scheduled fiscal day close is held back until an administrator reviews it (Admin > POS sales).`
  );
  // If the service holds a record under this number (ZIMRA refused the receipt after it was numbered), the number is
  // burned: handing it back would give the next sale a number the service then refuses as "already used for a
  // different receipt", and a whole run of sales fails behind the first one (seen in the 2026-11-06 rehearsal).
  // Only a number the service never stored (refused before numbering) may go back to the counter.
  let release = problem.code !== "INVOICE_NO_REUSED";
  if (release) {
    try {
      if (await getReceipt(serviceDeviceId, claimed.invoiceNumber!)) release = false;
    } catch {
      release = false; // cannot tell: keep the number rather than risk a reuse
    }
  }
  return settle(claimed, prefix, "FAILED", problem.message, release);
}

/** Queued sales are delivered by the service; ask it which ones have been accepted and finish those here. */
async function collectServiceResults(deviceKey: string, limit: number): Promise<number> {
  let serviceDeviceId: string;
  try {
    serviceDeviceId = await resolveServiceDeviceId(deviceKey);
  } catch {
    return 0;
  }
  const waiting = await PosSale.find({ ...saleDeviceFilter(deviceKey), status: { $in: OPEN_STATES }, invoiceNumber: { $exists: true } })
    .sort({ soldAt: 1 })
    .limit(limit);
  let done = 0;
  for (const sale of waiting) {
    try {
      const r = await getReceipt(serviceDeviceId, sale.invoiceNumber!);
      if (r?.status === "fiscalised") {
        await markFiscalised(sale._id, toPosFiscal(r, sale));
        done++;
      } else if (!r) {
        // The service never received it (the call failed before it arrived): send it now.
        const after = await fiscalisePosSale(String(sale._id), { reason: "auto-retry", force: true });
        if (after.status === "FISCALISED") done++;
      }
    } catch (e) {
      if (e instanceof FiscalServiceUnavailable) break;
      logger.warn({ saleId: String(sale._id), err: e instanceof Error ? e.message : String(e) }, "Could not collect service result");
    }
  }
  return done;
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

  // A sale from an earlier day is fiscalised in whichever fiscal day is open when it finally goes through. ZIMRA
  // dates the receipt then; our own record keeps the day it was actually sold. Nobody has to approve it.
  if (seen.needsApproval) await PosSale.updateOne({ _id: seen._id }, { $set: { needsApproval: false } });

  // The sale's own device, fixed when it was created. Older sales have none and used the central device.
  const deviceKey = seen.fiscalDeviceKey || CENTRAL_KEY;

  // A fiscal day close is about to run on this device: hold receipts back for those few seconds so the
  // device's counters cannot move under the close. They are retried by the queue straight afterwards.
  if (await isFenced(deviceKey)) {
    if (seen.status === "PENDING") {
      return settle(seen, prefix, "UNFISCALISED", "Fiscal day is being closed; queued for retry", false);
    }
    return (await PosSale.findById(saleId))!;
  }

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

  if (fiscalBackend() === "service") {
    try {
      return await fiscaliseViaService(claimed, prefix, deviceKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ saleId, err: msg }, "POS fiscalise (service) crashed");
      const fresh = (await PosSale.findById(saleId))!;
      return settle(fresh, prefix, fresh.invoiceNumber ? "UNKNOWN" : "UNFISCALISED", msg, false);
    }
  }

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
            // The device refused the receipt, but a refusal is not proof it was not stored. Ask before the
            // number is given up, otherwise a stored receipt would be orphaned and the number reused.
            try {
              const found = await getDeviceInvoice(invoiceNumber, device);
              if (found.found) {
                const m = checkFiscalMatchesSale(claimed, found.fiscal);
                if (m.ok) return (await markFiscalised(claimed._id, found.fiscal))!;
                await burnNumber(claimed, m.reason);
                continue;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              return settle(claimed, prefix, "UNKNOWN", `Device refused the receipt (${outcome.message}) and could not be asked: ${msg}`, false);
            }
            // Not on the device. Keep the sale visible for an administrator: a refused receipt means the
            // sale data broke a ZIMRA rule, and it blocks the scheduled close until reviewed.
            await PosSale.updateOne(
              { _id: claimed._id },
              { $set: { needsReview: true, reviewNote: outcome.message.slice(0, 500) } }
            );
            void sendFiscalAlertOnce(
              `receipt-refused:${String(claimed._id)}`,
              "A receipt was refused by the fiscal device",
              `Sale ${claimed.invoiceNumber ?? String(claimed._id)} was refused by the fiscal device and needs review.

Reason: ${outcome.message}

The scheduled fiscal day close is held back until an administrator reviews it (Admin > POS sales).`
            );
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
async function runQueueForDevice(deviceKey: string, limit: number): Promise<PosQueueDeviceResult> {
  const filter = saleDeviceFilter(deviceKey);
  const pendingCount = () => PosSale.countDocuments({ ...filter, status: { $in: OPEN_STATES } });

  if (fiscalBackend() === "service") {
    // The service delivers by itself; here we only collect what it has accepted and send what never reached it.
    const out: PosQueueDeviceResult = { key: deviceKey, name: deviceKey, reachable: false, dayOpen: null, attempted: 0, fiscalised: 0, stillPending: 0 };
    try {
      const st = await engineStatus(await resolveServiceDeviceId(deviceKey));
      out.reachable = true;
      out.dayOpen = st.dayOpen;
      if (st.paused) out.message = `Paused: ${st.paused}`;
    } catch (e) {
      out.message = e instanceof Error ? e.message : String(e);
      out.stillPending = await pendingCount();
      return out;
    }
    out.fiscalised += await collectServiceResults(deviceKey, limit);
    const unnumbered = await PosSale.find({ ...filter, status: "UNFISCALISED", needsApproval: false, invoiceNumber: { $exists: false } })
      .sort({ soldAt: 1 })
      .limit(limit);
    for (const sale of unnumbered) {
      out.attempted++;
      const after = await fiscalisePosSale(String(sale._id), { reason: "auto-retry", force: true });
      if (after.status === "FISCALISED") out.fiscalised++;
    }
    out.stillPending = await pendingCount();
    return out;
  }

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

  let status = await getPosDeviceStatus(device);
  // Sales are waiting but the fiscal day is closed: open it (if this device is set to) so nobody has to.
  if (status.reachable && !status.dayOpen) {
    const waiting = await PosSale.countDocuments({ ...filter, status: { $in: ["UNFISCALISED", "UNKNOWN"] }, needsApproval: false });
    if (waiting > 0) {
      const { openDayForWaitingSales } = await import("@/lib/services/fiscalSchedule.service");
      if (await openDayForWaitingSales(deviceKey)) status = await getPosDeviceStatus(device);
    }
  }
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
 * 2. Sales still waiting from an earlier day are released (they are fiscalised in the day that is open now).
 * 3. For each fiscal device: if it is reachable and the day is open, reconcile UNKNOWN sales
 *    (GetInvoice first) and retry UNFISCALISED sales (from any day), with exponential backoff.
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

  // Sales that were held for approval under the old rule are released: earlier-day sales now go through by themselves.
  await PosSale.updateMany({ status: { $in: OPEN_STATES }, needsApproval: true }, { $set: { needsApproval: false } });
  const scope = opts.deviceKey ? saleDeviceFilter(opts.deviceKey) : {};
  const needApproval = await PosSale.countDocuments({ ...scope, status: { $in: OPEN_STATES }, needsApproval: true });

  let keys: string[];
  if (opts.deviceKey) {
    keys = [opts.deviceKey];
  } else {
    const others = (
      await PosSale.distinct("fiscalDeviceKey", { status: { $in: OPEN_STATES }, needsApproval: false })
    ).filter((k): k is string => typeof k === "string" && k !== CENTRAL_KEY);
    keys = [CENTRAL_KEY, ...others];
  }

  const settled = await Promise.allSettled(keys.map((k) => runQueueForDevice(k, limit)));
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

  // Invoices waiting to be emailed go out as soon as their sale is fiscalised. Never blocks the queue.
  if (!opts.deviceKey) {
    try {
      await sendPendingInvoiceEmails();
    } catch (e) {
      logger.error({ err: e }, "Pending invoice emails failed");
    }
  }

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

/** An administrator has looked at a refused receipt; it no longer holds back the scheduled close. */
export async function clearSaleReview(saleId: string): Promise<IPosSaleDoc> {
  await dbConnect();
  const sale = await PosSale.findByIdAndUpdate(saleId, { $set: { needsReview: false } }, { new: true });
  if (!sale) throw new PosError("Sale not found", 404, "NO_SALE");
  return sale;
}

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
  await PosSale.updateOne({ _id: sale._id }, { $set: { status: "VOIDED", needsApproval: false, needsReview: false } });
  // A voided sale gives its slip back, so the cashier can invoice it again.
  if (sale.source?.scanId) {
    await DespatchScan.updateOne(
      { _id: sale.source.scanId, saleId: sale._id },
      { $set: { status: "ready" }, $unset: { appliedAt: "", appliedBy: "", saleId: "" } }
    );
  }
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
  /**
   * Everything still waiting for a fiscal receipt, whatever day it was sold. `pending` only covers the day asked
   * for, so a sale from yesterday that never went through would vanish from the running figure.
   */
  waiting: { count: number; total: number };
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
    USD: { currency: "USD", fiscalised: { count: 0, total: 0, vat: 0 }, credit: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, waiting: { count: 0, total: 0 }, failed: 0, voided: 0 },
    ZWG: { currency: "ZWG", fiscalised: { count: 0, total: 0, vat: 0 }, credit: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, waiting: { count: 0, total: 0 }, failed: 0, voided: 0 },
  };
  const waitingMatch: Record<string, unknown> = { status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] } };
  if (opts.branchId) waitingMatch.branchId = new Types.ObjectId(opts.branchId);
  if (!opts.includeTest) waitingMatch.isTest = { $ne: true };
  const waiting = await PosSale.aggregate<{ _id: PosCurrency; count: number; total: number }>([
    { $match: waitingMatch },
    { $group: { _id: "$currency", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
  ]);
  for (const w of waiting) if (out[w._id]) out[w._id].waiting = { count: w.count, total: round2(w.total) };
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
