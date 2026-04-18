import { Document, model, models, Schema, Types } from "mongoose";

export type InvoiceStatus = "draft" | "sent" | "DRAFT" | "SUBMITTED";
export type ReceiptType = "FiscalInvoice" | "CreditNote" | "DebitNote";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";
export type ReceiptPrintForm = "InvoiceA4" | "Receipt48";

export interface IInvoiceItem {
  productId: Types.ObjectId;
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface IInvoiceLine {
  lineNo: number;
  lineType: string;
  hsCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode: string;
  taxPercent: number;
  vatAmount: number;
  lineTotalExcl: number;
  lineTotalIncl: number;
}

export interface IBuyerSnapshot {
  registerName: string;
  tradeName: string;
  tin: string;
  vatNumber: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
}

export interface IFiscalData {
  verificationCode: string;
  verificationLink: string;
  qrCodeUrl: string;
  fiscalDayNo: number | null;
  fdmsInvoiceNo: string;
  receiptGlobalNo: string;
  receiptCounter: string;
  receiptId: string;
  deviceId: string;
  rawResponse: unknown;
}

export interface IInvoice {
  quotationId: Types.ObjectId;
  customerId: Types.ObjectId;
  invoiceNumber: string;
  items: IInvoiceItem[];
  subtotal: string;
  qrCodeData: string;
  status: InvoiceStatus;

  // Fiscalization fields
  receiptType: ReceiptType;
  receiptCurrency: string;
  receiptDate: Date;
  receiptPrintForm: ReceiptPrintForm;
  paymentMethod: PaymentMethod;
  taxInclusive: boolean;
  subtotalExclTax: number;
  totalVat: number;
  totalAmount: number;
  fiscalStatus: "DRAFT" | "SUBMITTED";
  fiscalSubmittedAt?: Date;
  isFiscalized: boolean;
  receiptNotes?: string;
  fiscalData?: IFiscalData;
  lines: IInvoiceLine[];
  buyerSnapshot: IBuyerSnapshot;
}

export interface IInvoiceDoc extends IInvoice, Document {}

const InvoiceItemSchema = new Schema<IInvoiceItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "ProductMaster",
    },
    name: { type: String, required: true },
    standardCode: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: String, required: true },
    lineTotal: { type: String, required: true },
  },
  { _id: false }
);

const InvoiceLineSchema = new Schema<IInvoiceLine>(
  {
    lineNo: { type: Number, required: true },
    lineType: { type: String, default: "Sale" },
    hsCode: { type: String },
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    taxCode: { type: String, enum: ["A", "B", "C"], default: "A" },
    taxPercent: { type: Number, required: true },
    vatAmount: { type: Number, default: 0 },
    lineTotalExcl: { type: Number, default: 0 },
    lineTotalIncl: { type: Number, default: 0 },
  },
  { _id: false }
);

const BuyerSnapshotSchema = new Schema<IBuyerSnapshot>(
  {
    registerName: { type: String, default: "" },
    tradeName: { type: String, default: "" },
    tin: { type: String, default: "" },
    vatNumber: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    province: { type: String, default: "" },
  },
  { _id: false }
);

const FiscalDataSchema = new Schema<IFiscalData>(
  {
    verificationCode: { type: String, default: "" },
    verificationLink: { type: String, default: "" },
    qrCodeUrl: { type: String, default: "" },
    fiscalDayNo: { type: Number, default: null },
    fdmsInvoiceNo: { type: String, default: "" },
    receiptGlobalNo: { type: String, default: "" },
    receiptCounter: { type: String, default: "" },
    receiptId: { type: String, default: "" },
    deviceId: { type: String, default: "" },
    rawResponse: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    quotationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Quotation",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Customer",
    },
    invoiceNumber: { type: String, required: true, unique: true },
    items: { type: [InvoiceItemSchema], required: true },
    subtotal: { type: String, required: true },
    qrCodeData: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "sent", "DRAFT", "SUBMITTED"],
      default: "draft",
    },

    // Fiscalization fields
    receiptType: {
      type: String,
      enum: ["FiscalInvoice", "CreditNote", "DebitNote"],
      default: "FiscalInvoice",
    },
    receiptCurrency: { type: String, default: "USD" },
    receiptDate: { type: Date, default: Date.now },
    receiptPrintForm: {
      type: String,
      enum: ["InvoiceA4", "Receipt48"],
      default: "InvoiceA4",
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "TRANSFER", "OTHER"],
      default: "CASH",
    },
    taxInclusive: { type: Boolean, default: true },
    subtotalExclTax: { type: Number, default: 0 },
    totalVat: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    fiscalStatus: {
      type: String,
      enum: ["DRAFT", "SUBMITTED"],
      default: "DRAFT",
    },
    fiscalSubmittedAt: { type: Date },
    isFiscalized: { type: Boolean, default: false },
    receiptNotes: { type: String },
    fiscalData: { type: FiscalDataSchema },
    lines: { type: [InvoiceLineSchema], default: [] },
    buyerSnapshot: { type: BuyerSnapshotSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const Invoice =
  models?.Invoice || model<IInvoice>("Invoice", InvoiceSchema);

export default Invoice;
