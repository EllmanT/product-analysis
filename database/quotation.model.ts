import { Document, model, models, Schema, Types } from "mongoose";

export type QuotationStatus =
  | "pending"
  | "confirmed"
  | "invoiced"
  | "cancelled";

export type QuotationPaymentStatus = "unpaid" | "paid";

export interface IQuotationItem {
  productId: Types.ObjectId;
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface IQuotation {
  customerId: Types.ObjectId;
  items: IQuotationItem[];
  subtotal: string;
  status: QuotationStatus;
  paymentStatus: QuotationPaymentStatus;
}

export interface IQuotationDoc extends IQuotation, Document {}

const QuotationItemSchema = new Schema<IQuotationItem>(
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

const QuotationSchema = new Schema<IQuotation>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Customer",
    },
    items: { type: [QuotationItemSchema], required: true },
    subtotal: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "invoiced", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
  },
  { timestamps: true }
);

const Quotation =
  models?.Quotation || model<IQuotation>("Quotation", QuotationSchema);

export default Quotation;
