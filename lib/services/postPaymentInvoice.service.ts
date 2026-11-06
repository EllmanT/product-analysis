import type { IInvoice } from "@/database/invoice.model";
import { issueFiscalDocument } from "@/lib/fiscal/issue";
import { generateInvoice } from "@/lib/services/invoice.service";

function mapRecordMethodToInvoicePaymentMethod(
  method: string
): IInvoice["paymentMethod"] {
  const m = method.toLowerCase();
  if (m === "zimswitch") return "CARD";
  if (m === "ecocash") return "OTHER";
  return "OTHER";
}

/**
 * After an online payment is recorded, create the invoice and hand it to the fiscal layer.
 * A ZIMRA or device problem queues the invoice for the retry queue; it is never lost and the payment is never undone.
 * Idempotent: generateInvoice returns the existing invoice and fiscalising twice is harmless.
 */
export async function issueFiscalInvoiceForPaidQuotation(
  quotationId: string,
  paymentMethod: IInvoice["paymentMethod"]
): Promise<void> {
  try {
    const inv = await generateInvoice(quotationId, { paymentMethod });
    const outcome = await issueFiscalDocument({ kind: "shop", invoiceId: inv._id.toString() });
    if (outcome.status !== "FISCALISED") {
      console.warn("[issueFiscalInvoiceForPaidQuotation]", outcome.status, { quotationId, message: outcome.message });
    }
  } catch (err) {
    console.error("[issueFiscalInvoiceForPaidQuotation] failed", {
      quotationId,
      paymentMethod,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function issueFiscalInvoiceAfterOnlineRecord(
  quotationId: string,
  recordMethod: string
): Promise<void> {
  await issueFiscalInvoiceForPaidQuotation(
    quotationId,
    mapRecordMethodToInvoicePaymentMethod(recordMethod)
  );
}
