import { Document, model, models, Schema, Types } from "mongoose";

export type EcocashTransactionStatus = "pending" | "completed" | "failed";

export interface IEcocashTransaction {
  quotationId: Types.ObjectId;
  customerId: Types.ObjectId;
  clientCorrelator: string;
  referenceCode: string;
  phoneNumber: string;
  localAmount: number;
  localCurrency: string;
  usdAmount: number;
  status: EcocashTransactionStatus;
  ecocashResponse: Record<string, unknown>;
  paymentId?: string;
  completedAt?: Date;
}

export interface IEcocashTransactionDoc extends IEcocashTransaction, Document {}

const EcocashTransactionSchema = new Schema<IEcocashTransaction>(
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
    clientCorrelator: { type: String, required: true, unique: true },
    referenceCode: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    localAmount: { type: Number, required: true },
    localCurrency: { type: String, required: true },
    usdAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    ecocashResponse: { type: Schema.Types.Mixed, default: {} },
    paymentId: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

const EcocashTransaction =
  models?.EcocashTransaction ||
  model<IEcocashTransaction>("EcocashTransaction", EcocashTransactionSchema);

export default EcocashTransaction;
