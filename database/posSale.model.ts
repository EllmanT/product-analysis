import { Document, model, models, Schema, Types } from "mongoose";

export type PosCurrency = "USD" | "ZWG";
export type PosPaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";

/**
 * PENDING      saved, not yet sent to the device
 * SUBMITTING   a request to the device is in flight (claimed atomically)
 * FISCALISED   device returned a signed receipt (QR + verification code)
 * UNFISCALISED device unreachable or day closed; provisional slip issued, retry queue owns it
 * UNKNOWN      request may or may not have reached the device; reconciled with GetInvoice
 * FAILED       device rejected the receipt definitively (validation error)
 * VOIDED       cancelled before it was ever fiscalised
 */
export type PosSaleStatus =
  | "PENDING"
  | "SUBMITTING"
  | "FISCALISED"
  | "UNFISCALISED"
  | "UNKNOWN"
  | "FAILED"
  | "VOIDED";

export interface IPosSaleLine {
  lineNo: number;
  productId?: Types.ObjectId;
  description: string;
  hsCode?: string;
  quantity: number;
  unitPrice: number;
  taxCode: string;
  taxPercent: number;
  vatAmount: number;
  lineTotalExcl: number;
  lineTotalIncl: number;
}

export interface IPosBuyer {
  registerName?: string;
  tradeName?: string;
  tin?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
}

export interface IPosFiscal {
  verificationCode: string;
  verificationLink: string;
  qrCodeUrl: string;
  fiscalDayNo: number | null;
  receiptGlobalNo: string;
  receiptCounter: string;
  /** Number as stored on the device, `${deviceId}-${invoiceNumber}`. */
  deviceInvoiceNo: string;
  deviceId: string;
  deviceSerialNumber: string;
  receiptDate: string;
  rawResponse?: unknown;
}

export type PosSaleKind = "SALE" | "CREDIT_NOTE";

export interface IPosSale {
  /**
   * Which fiscal device this sale belongs to: "central" or a FiscalDevice id. Fixed when the sale is
   * created and never re-resolved, so a later change of the branch's device cannot send an
   * already-numbered sale to a different device. Missing on older sales, which means central.
   */
  fiscalDeviceKey?: string;
  /** SALE (default) or the credit note that reverses a fiscalised sale (negative amounts). */
  kind: PosSaleKind;
  /** Credit note: the sale it reverses, its number, and why. */
  originalSaleId?: Types.ObjectId;
  originalNumber?: string;
  creditReason?: string;
  /** Sale: the credit note issued against it (at most one). */
  creditNoteId?: Types.ObjectId;
  branchId: Types.ObjectId;
  cashierId: Types.ObjectId;
  /** Client generated; a retry of the same sale returns the original. */
  idempotencyKey: string;
  currency: PosCurrency;
  /** USD→ZWG rate used to price this sale (1 for USD). */
  exchangeRate: number;
  taxInclusive: boolean;
  paymentMethod: PosPaymentMethod;
  lines: IPosSaleLine[];
  subtotalExclTax: number;
  totalVat: number;
  totalAmount: number;
  buyer?: IPosBuyer;
  notes?: string;

  status: PosSaleStatus;
  /** Fiscal number, e.g. HU0001. Assigned at the first device attempt. */
  invoiceNumber?: string;
  /** Provisional slip number, e.g. HUP0001. Assigned when the sale becomes UNFISCALISED. */
  provisionalNumber?: string;
  fiscal?: IPosFiscal;

  /** When the money changed hands (till clock for offline sales). */
  soldAt: Date;
  /** Harare calendar date of soldAt, "YYYY-MM-DD" (same-day retry rule). */
  soldDate: string;
  fiscalisedAt?: Date;
  submittingAt?: Date;
  attempts: number;
  lastError?: string;
  /** Cross-day sale waiting for an admin to approve fiscalising it today. */
  needsApproval: boolean;
  approvedBy?: Types.ObjectId;
  /** Test sales created by the simulation tooling. */
  isTest: boolean;
  /** Made while the till had no connection and synced later (slip was provisional). */
  offline: boolean;
  slipPrintCount: number;
  emailedTo?: string[];
}

export interface IPosSaleDoc extends IPosSale, Document {}

const LineSchema = new Schema<IPosSaleLine>(
  {
    lineNo: { type: Number, required: true },
    productId: { type: Schema.Types.ObjectId, ref: "ProductMaster" },
    description: { type: String, required: true },
    hsCode: String,
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    taxCode: { type: String, required: true },
    taxPercent: { type: Number, required: true },
    vatAmount: { type: Number, required: true },
    lineTotalExcl: { type: Number, required: true },
    lineTotalIncl: { type: Number, required: true },
  },
  { _id: false }
);

const PosSaleSchema = new Schema<IPosSale>(
  {
    kind: { type: String, enum: ["SALE", "CREDIT_NOTE"], default: "SALE" },
    originalSaleId: { type: Schema.Types.ObjectId, ref: "PosSale" },
    originalNumber: String,
    creditReason: { type: String, maxlength: 200 },
    creditNoteId: { type: Schema.Types.ObjectId, ref: "PosSale" },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    currency: { type: String, enum: ["USD", "ZWG"], required: true },
    exchangeRate: { type: Number, default: 1 },
    taxInclusive: { type: Boolean, default: true },
    paymentMethod: { type: String, enum: ["CASH", "CARD", "TRANSFER", "OTHER"], default: "CASH" },
    lines: { type: [LineSchema], required: true },
    subtotalExclTax: { type: Number, required: true },
    totalVat: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    buyer: {
      registerName: String,
      tradeName: String,
      tin: String,
      vatNumber: String,
      email: String,
      phone: String,
      address: String,
      city: String,
    },
    notes: String,

    status: {
      type: String,
      enum: ["PENDING", "SUBMITTING", "FISCALISED", "UNFISCALISED", "UNKNOWN", "FAILED", "VOIDED"],
      default: "PENDING",
    },
    fiscalDeviceKey: { type: String },
    invoiceNumber: String,
    provisionalNumber: String,
    fiscal: {
      verificationCode: String,
      verificationLink: String,
      qrCodeUrl: String,
      fiscalDayNo: Number,
      receiptGlobalNo: String,
      receiptCounter: String,
      deviceInvoiceNo: String,
      deviceId: String,
      deviceSerialNumber: String,
      receiptDate: String,
      rawResponse: Schema.Types.Mixed,
    },

    soldAt: { type: Date, required: true },
    soldDate: { type: String, required: true },
    fiscalisedAt: Date,
    submittingAt: Date,
    attempts: { type: Number, default: 0 },
    lastError: String,
    needsApproval: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    isTest: { type: Boolean, default: false },
    offline: { type: Boolean, default: false },
    slipPrintCount: { type: Number, default: 0 },
    emailedTo: { type: [String], default: [] },
  },
  { timestamps: true }
);

PosSaleSchema.index({ idempotencyKey: 1 }, { unique: true });
PosSaleSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: "string" } } }
);
PosSaleSchema.index(
  { provisionalNumber: 1 },
  { unique: true, partialFilterExpression: { provisionalNumber: { $type: "string" } } }
);
PosSaleSchema.index({ branchId: 1, soldDate: -1, status: 1 });
PosSaleSchema.index({ status: 1, soldDate: 1 });
PosSaleSchema.index({ fiscalDeviceKey: 1, status: 1, soldDate: 1 });

const PosSale = models?.PosSale || model<IPosSale>("PosSale", PosSaleSchema);

export default PosSale;
