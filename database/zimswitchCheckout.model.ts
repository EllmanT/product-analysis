import { Document, model, models, Schema, Types } from "mongoose";

export type ZimswitchCheckoutStatus = "pending" | "completed" | "failed";

export interface IZimswitchCheckout {
  checkoutId: string;
  quotationId: Types.ObjectId;
  customerId: Types.ObjectId;
  entityId: string;
  paymentOption: string;
  amount: number;
  currency: string;
  status: ZimswitchCheckoutStatus;
}

export interface IZimswitchCheckoutDoc extends IZimswitchCheckout, Document {}

const ZimswitchCheckoutSchema = new Schema<IZimswitchCheckout>(
  {
    checkoutId: { type: String, required: true, unique: true },
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
    entityId: { type: String, required: true },
    paymentOption: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const ZimswitchCheckout =
  models?.ZimswitchCheckout ||
  model<IZimswitchCheckout>("ZimswitchCheckout", ZimswitchCheckoutSchema);

export default ZimswitchCheckout;
