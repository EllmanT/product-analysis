import { Types } from "mongoose";

import Customer from "@/database/customer.model";
import Invoice, { type IInvoice } from "@/database/invoice.model";
import Quotation, { type IQuotationItem } from "@/database/quotation.model";
import dbConnect from "@/lib/mongoose";
import { generateInvoiceNumber } from "@/lib/utils/invoiceNumber";
import { computeLineTotals, computeInvoiceTotals } from "@/lib/utils/invoiceCalculations";
import type { IZReportDoc } from "@/database/zReport.model";
import { closeFiscalDayWithReport, openFiscalDayOnly } from "@/lib/services/fiscalDayOps.service";
import { CENTRAL_KEY, resolveDeviceByKey, resolveServiceDeviceId } from "@/lib/services/fiscalDevice.service";
import { fiscalBackend, submitReceipt as serviceSubmitReceipt } from "@/lib/fiscal/client";
import { buildInvoiceServiceRequest, ShopFiscalError, toInvoiceFiscalData } from "@/lib/fiscal/invoiceMapping";
import { isRetryableProblem } from "@/lib/fiscal/serviceMapping";
import {
  submitReceipt,
  checkFiscalDayStatus,
} from "@/lib/services/zimraFiscal.service";
import {
  getZimraQrEmbedString,
  isInvoiceZimraVerifiedForDisplay,
} from "@/lib/utils/zimraInvoiceDisplay";

const DEFAULT_TAX_CODE = process.env.INVOICE_DEFAULT_TAX_CODE ?? "A";
const DEFAULT_TAX_PERCENT = parseFloat(process.env.INVOICE_DEFAULT_TAX_PERCENT ?? "15.5");
const DEFAULT_CURRENCY = process.env.INVOICE_DEFAULT_CURRENCY ?? "USD";
const DEFAULT_PRINT_FORM = process.env.INVOICE_DEFAULT_RECEIPT_PRINT_FORM ?? "InvoiceA4";

export async function generateInvoice(
  quotationId: string,
  options?: {
    paymentMethod?: IInvoice["paymentMethod"];
    taxInclusive?: boolean;
    receiptType?: IInvoice["receiptType"];
    receiptNotes?: string;
  }
) {
  await dbConnect();

  if (!Types.ObjectId.isValid(quotationId)) {
    throw new Error("Invalid quotation ID");
  }

  // Idempotent: return existing invoice if already generated
  const existing = await Invoice.findOne({
    quotationId: new Types.ObjectId(quotationId),
  });
  if (existing) return existing;

  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error("Quotation not found");

  if (!["pending", "confirmed"].includes(quotation.status)) {
    throw new Error("Only issued quotations can be invoiced");
  }

  const customer = await Customer.findById(quotation.customerId);
  if (!customer) throw new Error("Customer not found");

  const taxInclusive = options?.taxInclusive ?? true;
  const currency = DEFAULT_CURRENCY;
  const taxPercent = DEFAULT_TAX_PERCENT;
  const taxCode = DEFAULT_TAX_CODE;

  // Convert quotation items to invoice line inputs
  const lineInputs = quotation.items.map((item: IQuotationItem) => ({
    description: item.name,
    quantity: item.quantity,
    unitPrice: parseFloat(item.unitPrice) || 0,
    taxCode,
    taxPercent,
    hsCode: item.standardCode || undefined,
    lineType: "Sale",
  }));

  const computedLines = computeLineTotals(lineInputs, taxInclusive);
  const totals = computeInvoiceTotals(computedLines);
  const invoiceNumber = await generateInvoiceNumber(currency);

  // Build buyer snapshot from customer fields
  const buyerSnapshot = {
    registerName: customer.tradeName || `${customer.firstName} ${customer.lastName}`,
    tradeName: customer.tradeName || "",
    tin: customer.tinNumber || "",
    vatNumber: customer.vatNumber || "",
    email: customer.email,
    phone: customer.phone || "",
    address: customer.address || "",
    city: "",
    province: "",
  };

  // Legacy items array (kept for backward compat with existing shop views)
  const items = quotation.items.map((item: IQuotationItem) => ({
    productId: item.productId,
    name: item.name,
    standardCode: item.standardCode,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }));

  const invoice = await Invoice.create({
    quotationId: quotation._id,
    customerId: quotation.customerId,
    invoiceNumber,
    items,
    subtotal: String(totals.totalAmount),
    qrCodeData: "",
    status: "draft",

    receiptType: options?.receiptType ?? "FiscalInvoice",
    receiptCurrency: currency,
    receiptDate: new Date(),
    receiptPrintForm: DEFAULT_PRINT_FORM,
    paymentMethod: options?.paymentMethod ?? "CASH",
    taxInclusive,
    subtotalExclTax: totals.subtotalExclTax,
    totalVat: totals.totalVat,
    totalAmount: totals.totalAmount,
    fiscalStatus: "DRAFT",
    isFiscalized: false,
    receiptNotes: options?.receiptNotes,
    lines: computedLines.map((l) => ({
      lineNo: l.lineNo,
      lineType: l.lineType || "Sale",
      hsCode: l.hsCode,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxCode: l.taxCode ?? taxCode,
      taxPercent: l.taxPercent,
      vatAmount: l.vatAmount,
      lineTotalExcl: l.lineTotalExcl,
      lineTotalIncl: l.lineTotalIncl,
    })),
    buyerSnapshot,
  });

  quotation.status = "invoiced";
  await quotation.save();

  return invoice;
}

/** Send an invoice through the fiscal service, on the central device (the shop has no branch). */
async function submitInvoiceViaService(invoice: IInvoice) {
  const deviceId = await resolveServiceDeviceId(CENTRAL_KEY);
  const result = await serviceSubmitReceipt(deviceId, buildInvoiceServiceRequest(invoice, process.env.INVOICE_DEFAULT_HS_CODE ?? "00000000"));
  if (result.status === "fiscalised") return toInvoiceFiscalData(result);
  if (result.status === "queued") {
    // The service has signed and numbered it and keeps delivering. Asking again later returns the same receipt.
    throw new ShopFiscalError(result.reason || "ZIMRA has not answered yet; the fiscal service keeps trying.", "retry");
  }
  const problem = result.problems?.[0] ?? { code: "REFUSED", message: "The fiscal service refused the invoice" };
  throw new ShopFiscalError(`${problem.code}: ${problem.message}`, isRetryableProblem(problem.code) ? "retry" : "review");
}

export async function fiscalizeInvoice(invoiceId: string) {
  await dbConnect();

  if (!Types.ObjectId.isValid(invoiceId)) {
    throw new Error("Invalid invoice ID");
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  if (isInvoiceZimraVerifiedForDisplay(invoice)) {
    throw new Error("Invoice already fiscalized");
  }

  if (!invoice.lines || invoice.lines.length === 0) {
    throw new Error("Invoice has no fiscal line items. Regenerate the invoice from the quotation.");
  }

  // A credit or debit note must name the invoice it corrects, and the shop has no way to record that. Sent without it
  // ZIMRA flags the receipt as bad, and a bad receipt can stop the fiscal day from closing. Credit notes are issued at
  // the till, where the original is known.
  if (invoice.receiptType !== "FiscalInvoice") {
    throw new ShopFiscalError(
      `A ${invoice.receiptType === "CreditNote" ? "credit" : "debit"} note cannot be issued from the shop: it does not say which invoice it corrects. Issue it from the till instead.`,
      "review"
    );
  }

  const fiscalResult = fiscalBackend() === "service" ? await submitInvoiceViaService(invoice) : await submitReceipt(invoice);

  invoice.fiscalData = fiscalResult;
  invoice.isFiscalized = true;
  invoice.fiscalStatus = "SUBMITTED";
  invoice.status = "sent";
  invoice.fiscalSubmittedAt = new Date();
  // Whatever was waiting to retry or be reviewed is settled now.
  invoice.fiscalNextRetryAt = undefined;
  invoice.fiscalNeedsReview = false;
  invoice.fiscalLastError = undefined;
  invoice.qrCodeData =
    getZimraQrEmbedString(fiscalResult) || invoice.qrCodeData;
  await invoice.save();

  return invoice;
}

export async function getFiscalDayStatus(deviceKey?: string) {
  return checkFiscalDayStatus(await resolveDeviceByKey(deviceKey));
}

export async function openFiscalDay(deviceKey?: string) {
  await openFiscalDayOnly(deviceKey);
}

export async function closeFiscalDay(opts: { force?: boolean; deviceKey?: string } = {}): Promise<IZReportDoc> {
  return closeFiscalDayWithReport("manual", opts);
}
