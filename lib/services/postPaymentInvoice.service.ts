import type { IInvoice } from "@/database/invoice.model";
import { fiscalizeInvoice, generateInvoice } from "@/lib/services/invoice.service";

function mapRecordMethodToInvoicePaymentMethod(
  method: string
): IInvoice["paymentMethod"] {
  const m = method.toLowerCase();
  if (m === "zimswitch") return "CARD";
  if (m === "ecocash") return "OTHER";
  return "OTHER";
}

/**
 * After an online payment is recorded, create a draft fiscal invoice and submit to ZIMRA.
 * Idempotent: generateInvoice returns existing; fiscalize guards duplicates.
 */
export async function issueFiscalInvoiceForPaidQuotation(
  quotationId: string,
  paymentMethod: IInvoice["paymentMethod"]
): Promise<void> {
  try {
    const inv = await generateInvoice(quotationId, { paymentMethod });
    await fiscalizeInvoice(inv._id.toString());
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
