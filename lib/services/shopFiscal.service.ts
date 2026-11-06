import Invoice from "@/database/invoice.model";
import { classifyShopFiscalError, SHOP_MAX_ATTEMPTS, shopRetryDelayMs, ShopFiscalError } from "@/lib/fiscal/invoiceMapping";
import dbConnect from "@/lib/mongoose";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";
import { CENTRAL_KEY } from "@/lib/services/fiscalDevice.service";
import { openDayForWaitingSales } from "@/lib/services/fiscalSchedule.service";
import { fiscalizeInvoice } from "@/lib/services/invoice.service";
import { getPosDeviceStatus } from "@/lib/services/zimraPosDevice.service";

/** What happened to a document handed to the fiscal layer. Device trouble is never an exception. */
export interface FiscalOutcome {
  status: "FISCALISED" | "QUEUED" | "REVIEW";
  message?: string;
}

export interface ShopFiscalDeps {
  fiscalize?: (invoiceId: string) => Promise<unknown>;
  now?: () => Date;
  /** Is the device worth trying right now? Default: reachable, and its day open (or opened for us). */
  deviceReady?: () => Promise<boolean>;
}

const CLEAR_QUEUE = { fiscalNextRetryAt: "", fiscalLastError: "" } as const;

/**
 * Issue a shop invoice fiscally. Safe to call again: an invoice already fiscalised answers FISCALISED. A problem with
 * ZIMRA or the device queues the invoice for the retry queue instead of losing it; a problem with the invoice itself
 * (or too many failures) asks a person to look.
 */
export async function issueShopInvoice(invoiceId: string, deps: ShopFiscalDeps = {}): Promise<FiscalOutcome> {
  await dbConnect();
  const now = (deps.now ?? (() => new Date()))();
  try {
    await (deps.fiscalize ?? fiscalizeInvoice)(invoiceId);
    await Invoice.updateOne({ _id: invoiceId }, { $set: { fiscalNeedsReview: false }, $unset: CLEAR_QUEUE });
    return { status: "FISCALISED" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/already fiscali[sz]ed/i.test(message)) {
      await Invoice.updateOne({ _id: invoiceId }, { $set: { fiscalNeedsReview: false }, $unset: CLEAR_QUEUE });
      return { status: "FISCALISED" };
    }

    const kind = e instanceof ShopFiscalError ? e.kind : classifyShopFiscalError(message);
    const before = await Invoice.findById(invoiceId).select("fiscalAttempts invoiceNumber").lean<{ fiscalAttempts?: number; invoiceNumber?: string } | null>();
    const attempts = (before?.fiscalAttempts ?? 0) + 1;

    if (kind === "review" || attempts >= SHOP_MAX_ATTEMPTS) {
      await Invoice.updateOne(
        { _id: invoiceId },
        { $set: { fiscalAttempts: attempts, fiscalLastError: message.slice(0, 500), fiscalNeedsReview: true }, $unset: { fiscalNextRetryAt: "" } }
      );
      void sendFiscalAlertOnce(
        `shop-invoice-review:${invoiceId}`,
        "A shop invoice needs attention",
        `Invoice ${before?.invoiceNumber ?? invoiceId} could not be fiscalised${kind === "review" ? "" : ` after ${attempts} attempts`}.\n\nReason: ${message}\n\nThe customer has paid. Fix the cause, then use Fiscalise on the invoice (Admin > Invoices).`
      ).catch(() => undefined);
      return { status: "REVIEW", message };
    }

    await Invoice.updateOne(
      { _id: invoiceId },
      {
        $set: {
          fiscalAttempts: attempts,
          fiscalLastError: message.slice(0, 500),
          fiscalNextRetryAt: new Date(now.getTime() + shopRetryDelayMs(attempts)),
        },
      }
    );
    return { status: "QUEUED", message };
  }
}

export interface ShopQueueResult {
  attempted: number;
  fiscalised: number;
  stillQueued: number;
  needsReview: number;
  /** Invoices that were due but the device was not ready, so nothing was tried. */
  waiting: number;
}

/** Is the central device reachable with a day open? Opens the day when the device is set to open itself. */
async function centralDeviceReady(): Promise<boolean> {
  const st = await getPosDeviceStatus();
  if (!st.reachable) return false;
  if (st.dayOpen) return true;
  return openDayForWaitingSales(CENTRAL_KEY);
}

/**
 * Try again every shop invoice that is due. Called from the same cron as the till's queue. Invoices that were never
 * handed to the payment flow (drafts an admin will fiscalise by hand) have no retry time and are never touched.
 */
export async function runShopInvoiceQueue(limit = 10, deps: ShopFiscalDeps = {}): Promise<ShopQueueResult> {
  await dbConnect();
  const now = (deps.now ?? (() => new Date()))();
  const out: ShopQueueResult = { attempted: 0, fiscalised: 0, stillQueued: 0, needsReview: 0, waiting: 0 };

  const due = await Invoice.find({ isFiscalized: false, fiscalNeedsReview: { $ne: true }, fiscalNextRetryAt: { $lte: now } })
    .sort({ fiscalNextRetryAt: 1 })
    .limit(limit)
    .select("_id")
    .lean<{ _id: unknown }[]>();
  if (due.length === 0) return out;

  const ready = await (deps.deviceReady ?? centralDeviceReady)().catch(() => false);
  if (!ready) {
    out.waiting = due.length;
    return out;
  }

  for (const d of due) {
    out.attempted++;
    const r = await issueShopInvoice(String(d._id), deps);
    if (r.status === "FISCALISED") out.fiscalised++;
    else if (r.status === "REVIEW") out.needsReview++;
    else out.stillQueued++;
  }
  return out;
}
