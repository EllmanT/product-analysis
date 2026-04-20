import { Document, model, models, Schema, Types } from "mongoose";

export type QuotationStatus =
  | "pending"
  | "confirmed"
  | "invoiced"
  | "cancelled";

export type QuotationPaymentStatus = "unpaid" | "paid";

export type CheckoutPaymentMethod = "cod" | "card" | "ecocash";

export type QuotationFulfillmentStatus = "pending" | "delivered";

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
  paidAt?: Date;
  paymentReference?: string;
  /** How the customer intends to pay (chosen before completing payment or COD). */
  checkoutPaymentMethod?: CheckoutPaymentMethod;
  paymentMethodChosenAt?: Date;
  /** For COD: delivery must be confirmed before fiscal invoice. */
  fulfillmentStatus?: QuotationFulfillmentStatus;
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
    paidAt: { type: Date },
    paymentReference: { type: String },
    checkoutPaymentMethod: {
      type: String,
      enum: ["cod", "card", "ecocash"],
    },
    paymentMethodChosenAt: { type: Date },
    fulfillmentStatus: {
      type: String,
      enum: ["pending", "delivered"],
    },
  },
  { timestamps: true }
);

const Quotation =
  models?.Quotation || model<IQuotation>("Quotation", QuotationSchema);

export default Quotation;
