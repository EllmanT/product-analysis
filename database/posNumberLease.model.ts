import { Document, model, models, Schema, Types } from "mongoose";

/** Which till was handed which block of provisional numbers (for tracing a slip back to a till). */
export interface IPosNumberLease {
  branchId: Types.ObjectId;
  tillId?: Types.ObjectId;
  currency: "USD" | "ZWG";
  numbers: string[];
}

export interface IPosNumberLeaseDoc extends IPosNumberLease, Document {}

const PosNumberLeaseSchema = new Schema<IPosNumberLease>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    tillId: { type: Schema.Types.ObjectId, ref: "Till" },
    currency: { type: String, enum: ["USD", "ZWG"], required: true },
    numbers: { type: [String], default: [] },
  },
  { timestamps: true }
);

PosNumberLeaseSchema.index({ branchId: 1, createdAt: -1 });
PosNumberLeaseSchema.index({ tillId: 1, createdAt: -1 });

const PosNumberLease = models?.PosNumberLease || model<IPosNumberLease>("PosNumberLease", PosNumberLeaseSchema);

export default PosNumberLease;
