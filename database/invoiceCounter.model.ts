import { Document, model, models, Schema, Types } from "mongoose";

/**
 * One counter per (branch, series). Series: "USD", "ZWG" (fiscal) and
 * "USD-P", "ZWG-P" (provisional slips).
 * `free` holds numbers that were allocated but definitively not used (device rejected
 * the receipt), so the fiscal series stays gapless. The smallest free number is reused first.
 */
export interface IInvoiceCounter {
  branchId: Types.ObjectId;
  series: string;
  seq: number;
  free: number[];
}

export interface IInvoiceCounterDoc extends IInvoiceCounter, Document {}

const InvoiceCounterSchema = new Schema<IInvoiceCounter>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    series: { type: String, required: true },
    seq: { type: Number, default: 0 },
    free: { type: [Number], default: [] },
  },
  { timestamps: true }
);

InvoiceCounterSchema.index({ branchId: 1, series: 1 }, { unique: true });

const InvoiceCounter =
  models?.InvoiceCounter || model<IInvoiceCounter>("InvoiceCounter", InvoiceCounterSchema);

export default InvoiceCounter;
