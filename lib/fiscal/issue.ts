/**
 * The one door to the fiscal layer for everything that is sold: a till sale or a shop invoice.
 *
 * Whatever the caller sells, the promise is the same: handing a document in never loses it and never throws because
 * ZIMRA or the device is having trouble. It comes back as one of
 *   FISCALISED  done, the receipt is at ZIMRA;
 *   QUEUED      kept safely and retried by the queue (nothing for the seller to do);
 *   REVIEW      a person must look (the data is wrong, or it has failed for too long).
 * The queues behind it run from one cron call: runFiscalQueues().
 */
import { fiscalisePosSale, runPosQueue, type FiscaliseOptions, type PosQueueRunResult } from "@/lib/services/posSale.service";
import { issueShopInvoice, runShopInvoiceQueue, type FiscalOutcome, type ShopQueueResult } from "@/lib/services/shopFiscal.service";

export type { FiscalOutcome };

export type FiscalDocumentRef =
  | { kind: "pos"; saleId: string; reason?: FiscaliseOptions["reason"]; force?: boolean; approvedBy?: string }
  | { kind: "shop"; invoiceId: string };

export async function issueFiscalDocument(ref: FiscalDocumentRef): Promise<FiscalOutcome> {
  if (ref.kind === "shop") return issueShopInvoice(ref.invoiceId);

  const sale = await fiscalisePosSale(ref.saleId, { reason: ref.reason ?? "till", force: ref.force, approvedBy: ref.approvedBy });
  if (sale.status === "FISCALISED") return { status: "FISCALISED" };
  // A sale the device refused outright needs a person; everything else (waiting, sending, outcome unknown) is retried.
  if (sale.status === "FAILED") return { status: "REVIEW", message: sale.lastError ?? undefined };
  return { status: "QUEUED", message: sale.lastError ?? undefined };
}

export interface FiscalQueuesResult {
  pos: PosQueueRunResult;
  shop: ShopQueueResult;
}

/** One pass over every queue. Neither queue can stop the other. */
export async function runFiscalQueues(limit = 25): Promise<FiscalQueuesResult> {
  const [pos, shop] = await Promise.allSettled([runPosQueue(limit), runShopInvoiceQueue()]);
  if (pos.status === "rejected") throw pos.reason;
  return {
    pos: pos.value,
    shop: shop.status === "fulfilled" ? shop.value : { attempted: 0, fiscalised: 0, stillQueued: 0, needsReview: 0, waiting: 0 },
  };
}
