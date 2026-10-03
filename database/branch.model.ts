import { Document, model, models, Schema, Types } from "mongoose";

/** Receipt header/footer printed on this branch's slips. */
export interface IBranchReceiptProfile {
  /** Trading / legal name shown at the top of the slip. */
  companyName?: string;
  /** Branch name shown under the company name. */
  branchName?: string;
  address?: string;
  phone?: string;
  email?: string;
  tin?: string;
  vatNumber?: string;
  logoUrl?: string;
  footerLines?: string[];
}

export interface IBranchPos {
  /** Branch may use the point of sale. */
  enabled: boolean;
  /** Invoice prefix, e.g. "H". Fiscal numbers are `${prefix}${U|Z}${0000}`. */
  invoicePrefix?: string;
  /** VAT percent applied to POS lines (device tax table must contain it). */
  taxPercent: number;
  /** Tax code sent to the device (A = standard rated). */
  taxCode: string;
  taxInclusive: boolean;
  defaultCurrency: "USD" | "ZWG";
  /** Hours a till may keep selling offline. null/undefined = no limit. */
  offlineLimitHours?: number | null;
  receipt: IBranchReceiptProfile;
}

// validation for the ide
// validation for the developer while we type code
export interface IBranch {
  name: string;
  storeId:Types.ObjectId;
  location:string;
  pos?: IBranchPos;
}

export interface IBranchDoc extends IBranch, Document {}
// validation for the backend
// validation for the mongoose schema
const BranchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true },
        storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
        location:{type:String, required:true},
    pos: {
      enabled: { type: Boolean, default: false },
      invoicePrefix: { type: String, trim: true, uppercase: true, match: /^[A-Z0-9]{1,4}$/ },
      taxPercent: { type: Number, default: 15.5 },
      taxCode: { type: String, default: "A" },
      taxInclusive: { type: Boolean, default: true },
      defaultCurrency: { type: String, enum: ["USD", "ZWG"], default: "USD" },
      offlineLimitHours: { type: Number, default: 5 },
      receipt: {
        companyName: String,
        branchName: String,
        address: String,
        phone: String,
        email: String,
        tin: String,
        vatNumber: String,
        logoUrl: String,
        footerLines: { type: [String], default: [] },
      },
    },
  },
  {
    timestamps: true,
  }
);

// An invoice prefix identifies a branch on the slip, so it must be unique.
BranchSchema.index(
  { "pos.invoicePrefix": 1 },
  { unique: true, partialFilterExpression: { "pos.invoicePrefix": { $type: "string" } } }
);

const Branch = models?.Branch || model<IBranch>("Branch", BranchSchema);

export default Branch;
