/**
 * Pure mapping between a POS sale and the fiscal-service's request/result. No I/O, so it is unit tested on its own.
 */
import type { IPosFiscal, IPosSale, PosPaymentMethod } from "@/database/posSale.model";
import type { ServiceReceiptRequest, ServiceReceiptResult } from "@/lib/fiscal/client";

type SaleForService = Pick<IPosSale, "invoiceNumber" | "currency" | "taxInclusive" | "paymentMethod" | "notes" | "lines" | "totalAmount" | "kind" | "originalNumber" | "buyer"> & {
  branchId?: unknown;
  tillCode?: string;
  _id?: unknown;
};

const MONEY: Record<PosPaymentMethod, string> = { CASH: "Cash", CARD: "Card", TRANSFER: "BankTransfer", OTHER: "Other" };

const fixed2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * The service takes positive quantities and a negative unit price on a credit note (the sale stores negative
 * quantities), and decimal strings for money so nothing is lost to floating point.
 */
export function buildServiceRequest(sale: SaleForService, defaultHsCode: string): ServiceReceiptRequest {
  const credit = sale.kind === "CREDIT_NOTE";
  const sign = credit ? -1 : 1;
  const total = Math.abs(sale.totalAmount) * sign;
  // Stable across retries: the provisional number is only assigned after a failed first attempt, and a resend must be identical.
  const notes = (sale.notes ?? "").trim();
  return {
    invoiceNo: sale.invoiceNumber!,
    receiptType: credit ? "CreditNote" : "FiscalInvoice",
    currency: sale.currency,
    taxInclusive: sale.taxInclusive,
    lines: sale.lines.map((l) => ({
      name: l.description,
      unitPrice: fixed2(Math.abs(l.unitPrice) * sign),
      quantity: Math.abs(l.quantity),
      taxPercent: l.taxPercent ?? null,
      hsCode: l.hsCode || defaultHsCode,
    })),
    payments: [{ moneyType: MONEY[sale.paymentMethod] ?? "Other", amount: fixed2(total) }],
    ...(sale.buyer
      ? {
          buyer: {
            buyerRegisterName: sale.buyer.registerName,
            buyerTradeName: sale.buyer.tradeName || sale.buyer.registerName,
            vatNumber: sale.buyer.vatNumber,
            buyerTIN: sale.buyer.tin,
            buyerContacts: { phoneNo: sale.buyer.phone, email: sale.buyer.email },
            buyerAddress: { street: sale.buyer.address, city: sale.buyer.city },
          },
        }
      : {}),
    ...(notes ? { notes: notes.slice(0, 300) } : credit ? { notes: "Credit note" } : {}),
    ...(credit ? { original: { invoiceNo: sale.originalNumber! } } : {}),
    meta: {
      ...(sale.branchId ? { branchId: String(sale.branchId) } : {}),
      ...(sale.tillCode ? { tillId: sale.tillCode } : {}),
      ...(sale._id ? { saleId: String(sale._id) } : {}),
    },
  };
}

/** "ABCD1234EFGH5678" -> "ABCD-1234-EFGH-5678", the way the slip prints it. */
export function formatVerificationCode(code: string): string {
  const c = code.replace(/-/g, "");
  return c.length === 16 ? c.toUpperCase().match(/.{4}/g)!.join("-") : code;
}

/**
 * The fiscal block of a sale from the service's answer. The service signs from the very request we sent, so the
 * "receipt" we store for the existing match check is built from the sale; the QR check inside it (ends with the
 * verification code, contains the global number) is the real one.
 */
export function toPosFiscal(result: ServiceReceiptResult, sale: SaleForService): IPosFiscal {
  const qr = result.qrData ?? "";
  const total = sale.kind === "CREDIT_NOTE" ? -Math.abs(sale.totalAmount) : sale.totalAmount;
  return {
    verificationCode: formatVerificationCode(result.verificationCode ?? ""),
    verificationLink: qr,
    qrCodeUrl: qr,
    fiscalDayNo: result.fiscalDayNo ?? null,
    receiptGlobalNo: result.receiptGlobalNo != null ? String(result.receiptGlobalNo) : "",
    receiptCounter: result.receiptCounter != null ? String(result.receiptCounter) : "",
    deviceInvoiceNo: result.invoiceNo,
    deviceId: result.deviceId != null ? String(result.deviceId) : "",
    deviceSerialNumber: result.deviceSerialNumber ?? "",
    receiptDate: result.receiptDate ?? "",
    rawResponse: {
      source: "fiscal-service",
      Data: {
        receipt: {
          invoiceNo: result.invoiceNo,
          receiptTotal: total,
          receiptCurrency: sale.currency,
          receiptLines: sale.lines.map((l) => ({ receiptLineNo: l.lineNo })),
          receiptGlobalNo: result.receiptGlobalNo,
          receiptCounter: result.receiptCounter,
          receiptDate: result.receiptDate,
        },
      },
      colour: result.colour,
      receiptId: result.receiptId,
    },
  };
}

/** Problems that mean "try again later", not "this sale is wrong". The number stays with the sale. */
const RETRYABLE = new Set(["DAY_CLOSING", "DEVICE_PAUSED", "NOT_LEADER", "ORIGINAL_NOT_DELIVERED", "DEVICE_BUSY", "DAY_NOT_OPEN"]);
export const isRetryableProblem = (code: string) => RETRYABLE.has(code);
