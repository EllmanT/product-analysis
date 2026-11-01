import { Document, model, models, Schema, Types } from "mongoose";

/**
 * A till (cash desk) in a branch. Several tills in one branch share the branch's invoice numbers and
 * fiscal device; the till only identifies who sold what, for tracing and reporting.
 * Tills are never deleted once they exist (sales point at them): they are switched off instead.
 */
export interface ITill {
  branchId: Types.ObjectId;
  /** Short stable code, unique within the branch ("T1", "T2", ...). */
  code: string;
  name: string;
  enabled: boolean;
}

export interface ITillDoc extends ITill, Document {}

const TillSchema = new Schema<ITill>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

TillSchema.index({ branchId: 1, code: 1 }, { unique: true });

const Till = models?.Till || model<ITill>("Till", TillSchema);

export default Till;
