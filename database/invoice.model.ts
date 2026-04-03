import { Document, model, models, Schema, Types } from "mongoose";

export type InvoiceStatus = "draft" | "sent";

export interface IInvoiceItem {
  productId: Types.ObjectId;
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface IInvoice {
  quotationId: Types.ObjectId;
  customerId: Types.ObjectId;
  invoiceNumber: string;
  items: IInvoiceItem[];
  subtotal: string;
  qrCodeData: string;
  status: InvoiceStatus;
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
    qrCodeData: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "sent"],
      default: "draft",
    },
  },
  { timestamps: true }
);

const Invoice =
  models?.Invoice || model<IInvoice>("Invoice", InvoiceSchema);

export default Invoice;
