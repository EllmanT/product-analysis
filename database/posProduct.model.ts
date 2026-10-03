import { Document, model, models, Schema, Types } from "mongoose";

/**
 * Something a branch can sell at the till.
 * branchId unset = available to every branch (admin managed).
 * ZWG price is USD price x exchange rate unless `priceZwg` overrides it.
 */
export interface IPosProduct {
  branchId?: Types.ObjectId;
  name: string;
  code?: string;
  hsCode?: string;
  priceUsd: number;
  /** Optional fixed ZWG price that replaces the converted one. */
  priceZwg?: number;
  /** Cashier types the price at the till (e.g. "various", "wiring"). */
  priceOnEntry: boolean;
  isActive: boolean;
}

export interface IPosProductDoc extends IPosProduct, Document {}

const PosProductSchema = new Schema<IPosProduct>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    code: { type: String, trim: true, maxlength: 60 },
    hsCode: { type: String, trim: true, maxlength: 20 },
    priceUsd: { type: Number, required: true, min: 0 },
    priceZwg: { type: Number, min: 0 },
    priceOnEntry: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PosProductSchema.index({ branchId: 1, isActive: 1, name: 1 });
// One live product per name within a branch (or among global products).
PosProductSchema.index({ branchId: 1, name: 1 }, { unique: true });

const PosProduct = models?.PosProduct || model<IPosProduct>("PosProduct", PosProductSchema);

export default PosProduct;
