/**
 * Shop invoices and the fiscal service: the request built from an invoice, the stored result, how a failure is
 * classified and how long to wait before trying again. Pure, so it is tested on its own.
 */
import type { IFiscalData, IInvoice } from "@/database/invoice.model";
import type { ServiceReceiptRequest, ServiceReceiptResult } from "@/lib/fiscal/client";
import { formatVerificationCode } from "@/lib/fiscal/serviceMapping";

/** `retry`: the cause is outside the invoice (ZIMRA or the device is down, the day is closed). `review`: a person must act. */
export class ShopFiscalError extends Error {
  constructor(
    message: string,
    public readonly kind: "retry" | "review"
  ) {
    super(message);
  }
}

type InvoiceForService = Pick<
  IInvoice,
  "invoiceNumber" | "receiptCurrency" | "taxInclusive" | "paymentMethod" | "receiptNotes" | "lines" | "totalAmount" | "receiptType" | "buyerSnapshot"
> & { _id?: unknown };

const MONEY: Record<IInvoice["paymentMethod"], string> = { CASH: "Cash", CARD: "Card", TRANSFER: "BankTransfer", OTHER: "Other" };

const fixed2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function buildInvoiceServiceRequest(inv: InvoiceForService, defaultHsCode: string): ServiceReceiptRequest {
  if (inv.receiptType !== "FiscalInvoice") {
    throw new ShopFiscalError("Credit and debit notes for shop invoices cannot be issued through the fiscal service yet.", "review");
  }
  if (!inv.lines || inv.lines.length === 0) {
    throw new ShopFiscalError("Invoice has no fiscal line items. Regenerate the invoice from the quotation.", "review");
  }
  const b = inv.buyerSnapshot;
  const named = !!b && [b.registerName, b.tradeName, b.tin, b.vatNumber, b.address, b.city].some((v) => typeof v === "string" && v.trim());
  const notes = (inv.receiptNotes ?? "").trim();
  return {
    invoiceNo: inv.invoiceNumber,
    receiptType: "FiscalInvoice",
    currency: inv.receiptCurrency,
    taxInclusive: inv.taxInclusive,
    lines: inv.lines.map((l) => ({
      name: l.description,
      unitPrice: fixed2(l.unitPrice),
      quantity: l.quantity,
      taxPercent: l.taxPercent ?? null,
      hsCode: l.hsCode || defaultHsCode,
    })),
    payments: [{ moneyType: MONEY[inv.paymentMethod] ?? "Other", amount: fixed2(inv.totalAmount) }],
    // The gateway refuses a buyer block with no contact, so a buyer is sent only when something was entered.
    ...(named
      ? {
          buyer: {
            buyerRegisterName: b!.registerName,
            buyerTradeName: b!.tradeName || b!.registerName,
            vatNumber: b!.vatNumber,
            buyerTIN: b!.tin,
            buyerContacts: { phoneNo: b!.phone, email: b!.email },
            buyerAddress: { street: b!.address, city: b!.city, province: b!.province },
          },
        }
      : {}),
    ...(notes ? { notes: notes.slice(0, 300) } : {}),
    meta: { ...(inv._id ? { saleId: String(inv._id) } : {}) },
  };
}

/** What an invoice stores once the service has fiscalised it. */
export function toInvoiceFiscalData(result: ServiceReceiptResult): IFiscalData {
  const qr = result.qrData ?? "";
  return {
    verificationCode: formatVerificationCode(result.verificationCode ?? ""),
    verificationLink: qr,
    qrCodeUrl: qr,
    fiscalDayNo: result.fiscalDayNo ?? null,
    fdmsInvoiceNo: result.invoiceNo,
    receiptGlobalNo: result.receiptGlobalNo != null ? String(result.receiptGlobalNo) : "",
    receiptCounter: result.receiptCounter != null ? String(result.receiptCounter) : "",
    receiptId: result.receiptId != null ? String(result.receiptId) : "",
    deviceId: result.deviceId != null ? String(result.deviceId) : "",
    rawResponse: { source: "fiscal-service", ...result },
  };
}

/** Problems that mean "the invoice is wrong": retrying the same data will never work. */
const REVIEW_PATTERNS = [
  /no (fiscal )?line items/i,
  /cannot be issued through the fiscal service/i,
  /\bRCPT\d{3}\b/,
  /HS_CODE|hs code/i,
  /validation/i,
  /already used for a different receipt/i,
  /invalid (buyer|tin|vat)/i,
];

/** Anything not clearly the invoice's fault (ZIMRA or the device is down, the day is closed, a timeout) is retried. */
export function classifyShopFiscalError(message: string): "retry" | "review" {
  return REVIEW_PATTERNS.some((p) => p.test(message)) ? "review" : "retry";
}

const MINUTE = 60_000;
const BACKOFF_MS = [1 * MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 30 * MINUTE];

/** How long to wait after the n-th failed attempt (1 = the first). Settles at half an hour. */
export function shopRetryDelayMs(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1]!;
}

/** After this many failures (about a day at the longest delay) a person is asked to look. */
export const SHOP_MAX_ATTEMPTS = 50;
