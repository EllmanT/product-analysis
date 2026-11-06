/** Shapes shared by the engine, the API and the app's client. All money is a decimal string, never a float. */
import type { PreparedReceipt } from "../core/index.js";
import type { MoneyType } from "../core/types.js";

export type ReceiptKind = "FiscalInvoice" | "CreditNote" | "DebitNote";

export interface SubmitLine {
  name: string;
  /** Unit price as a decimal string with at most 2 decimals ("11.50"). Negative on a credit note. */
  unitPrice: string;
  /** Quantity, at most 3 decimals. */
  quantity: number | string;
  /** ZIMRA's tax id. Optional: when left out it is looked up from taxPercent in the device's tax table. */
  taxId?: number;
  /** Percent for taxed lines; null or omitted for an exempt line. */
  taxPercent?: number | null;
  taxCode?: string;
  /** 8 digit HS code. Required on every line when the taxpayer is a VAT payer. */
  hsCode?: string;
}

export interface SubmitRequest {
  tenantId: string;
  /** Our invoice number. Unique per taxpayer; the same number sent again returns the original result. */
  invoiceNo: string;
  receiptType?: ReceiptKind;
  currency: string;
  /** Lines include tax (default). */
  taxInclusive?: boolean;
  lines: SubmitLine[];
  payments: { moneyType: MoneyType; amount: string }[];
  buyer?: {
    buyerRegisterName?: string;
    buyerTradeName?: string;
    vatNumber?: string;
    buyerTIN?: string;
    buyerContacts?: { phoneNo?: string; email?: string };
    buyerAddress?: { province?: string; city?: string; street?: string; houseNo?: string };
  };
  notes?: string;
  /** Credit or debit note: the invoice it refers to, which must already be fiscalised on this device. */
  original?: { invoiceNo: string };
  /** Passed through and stored for tracing; never sent to ZIMRA. */
  meta?: { branchId?: string; tillId?: string; saleId?: string };
}

export type RecordStatus =
  /** Numbered and stored, not yet sent (or sent without an answer: it will be sent again, identical). */
  | "SIGNED"
  /** A request is in flight, or its answer was lost. Resent identical until ZIMRA answers. */
  | "SENT"
  /** ZIMRA stored it. `colour` says whether it is clean. */
  | "ACCEPTED"
  /** ZIMRA refused it before storing, so it holds no number. The invoice was not fiscalised. */
  | "REJECTED";

export type Colour = "none" | "yellow" | "gray" | "red";

export interface ValidationProblem {
  code: string;
  message: string;
}

export interface ReceiptResult {
  invoiceNo: string;
  status: "fiscalised" | "queued" | "rejected";
  /** Present once the receipt is numbered (fiscalised or queued). */
  receiptGlobalNo?: number;
  receiptCounter?: number;
  fiscalDayNo?: number;
  deviceId?: number;
  deviceSerialNumber?: string;
  receiptDate?: string;
  /** The text for the receipt's QR code. Valid as soon as the receipt is numbered, even while still queued. */
  qrData?: string;
  /** The last 16 characters of the QR text, printed on the receipt. */
  verificationCode?: string;
  receiptId?: number;
  /** Colours ZIMRA gave the receipt: anything other than "none" or "yellow" needs attention. */
  colour?: Colour;
  validationErrors?: { code: string; colour: string; description?: string }[];
  /** For "rejected": why, as code + message. */
  problems?: ValidationProblem[];
  /** For "queued": why it has not been delivered yet. */
  reason?: string;
}

export interface ReceiptRecord {
  deviceKey: string;
  tenantId: string;
  invoiceNo: string;
  /** SHA-256 of the normalised request, so a repeat with different content is told apart from a retry. */
  requestHash: string;
  request: SubmitRequest;
  status: RecordStatus;
  /** Strictly increasing per device; the send order. */
  seq: number;
  fiscalDayNo?: number;
  receiptGlobalNo?: number;
  receiptCounter?: number;
  prepared?: PreparedReceipt;
  colour: Colour;
  response?: { receiptID: number; serverDate?: string; validationErrors: { code: string; colour: string; description?: string }[] };
  problems?: ValidationProblem[];
  attempts: number;
  lastError?: string;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
