import { Types } from "mongoose";

import Customer from "@/database/customer.model";
import Invoice, { type IInvoice } from "@/database/invoice.model";
import Quotation, { type IQuotationItem } from "@/database/quotation.model";
import dbConnect from "@/lib/mongoose";
import { generateInvoiceNumber } from "@/lib/utils/invoiceNumber";
import { computeLineTotals, computeInvoiceTotals } from "@/lib/utils/invoiceCalculations";
import type { IZReportDoc } from "@/database/zReport.model";
import { closeFiscalDayWithReport, openFiscalDayOnly } from "@/lib/services/fiscalDayOps.service";
import {
  submitReceipt,
  checkFiscalDayStatus,
} from "@/lib/services/zimraFiscal.service";

const DEFAULT_TAX_CODE = process.env.INVOICE_DEFAULT_TAX_CODE ?? "A";
const DEFAULT_TAX_PERCENT = parseFloat(process.env.INVOICE_DEFAULT_TAX_PERCENT ?? "15");
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

export async function fiscalizeInvoice(invoiceId: string) {
  await dbConnect();

  if (!Types.ObjectId.isValid(invoiceId)) {
    throw new Error("Invalid invoice ID");
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  if (invoice.isFiscalized || invoice.fiscalStatus === "SUBMITTED") {
    throw new Error("Invoice already fiscalized");
  }

  if (!invoice.lines || invoice.lines.length === 0) {
    throw new Error("Invoice has no fiscal line items. Regenerate the invoice from the quotation.");
  }

  const fiscalResult = await submitReceipt(invoice);

  invoice.fiscalData = fiscalResult;
  invoice.isFiscalized = true;
  invoice.fiscalStatus = "SUBMITTED";
  invoice.status = "sent";
  invoice.fiscalSubmittedAt = new Date();
  // Store verification link as QR data for backward compat
  invoice.qrCodeData = fiscalResult.verificationLink || fiscalResult.qrCodeUrl || invoice.qrCodeData;
  await invoice.save();

  return invoice;
}

export async function getFiscalDayStatus() {
  return checkFiscalDayStatus();
}

export async function openFiscalDay() {
  await openFiscalDayOnly();
}

export async function closeFiscalDay(): Promise<IZReportDoc> {
  return closeFiscalDayWithReport("manual");
}
