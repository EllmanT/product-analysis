import { model, models, Schema, Types } from "mongoose";

export type DespatchScanStatus = "processing" | "ready" | "failed" | "applied" | "dismissed";

export type DespatchMatchKind = "exact" | "suggested" | "none";

/** One slip line after clean-up and catalogue matching, ready for the cashier to review. */
export interface IDespatchLine {
  lineNo: number;
  /** Code as printed on the slip. */
  code: string;
  description: string;
  quantity: number;
  /** Unit price as printed on the slip (not yet converted to the branch's VAT basis). Null when the slip has none. */
  slipUnitPrice: number | null;
  /** Line total as printed on the slip. */
  slipTotal: number | null;
  matchKind: DespatchMatchKind;
  productId?: Types.ObjectId;
  productName?: string;
  hsCode: string;
  /** Things the cashier must look at: bad price, odd quantity, total that does not equal qty x price, ... */
  issues: string[];
}

export interface IDespatchScan {
  branchId: Types.ObjectId;
  /** The till the photo was meant for (set when pairing exists); null means any till in the branch. */
  tillId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  status: DespatchScanStatus;
  processingError?: string;
  /** Compressed photo kept for audit. Not selected by default. */
  image?: Buffer;
  imageMime: string;
  imageBytes: number;
  /** SHA-256 of the photo, to catch the same file uploaded twice. */
  imageHash: string;
  slipNumber?: string;
  /** Normalised slip number (upper case, alphanumerics only) used for duplicate detection. */
  slipNumberKey?: string;
  customerName?: string;
  customerTin?: string;
  customerEmail?: string;
  /** Whether the slip's prices include VAT: a hint from the AI, the cashier makes the final call. */
  pricesIncludeVat?: boolean | null;
  slipGrandTotal?: number | null;
  currency?: "USD" | "ZWG" | null;
  lines: IDespatchLine[];
  /** Slip-level warnings (unreadable total, lines dropped, ...). */
  warnings: string[];
  aiModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Set when the cashier imports the scan and when the sale made from it is raised. */
  appliedAt?: Date;
  appliedBy?: Types.ObjectId;
  saleId?: Types.ObjectId;
}

const LineSchema = new Schema<IDespatchLine>(
  {
    lineNo: { type: Number, required: true },
    code: { type: String, default: "" },
    description: { type: String, required: true, maxlength: 200 },
    quantity: { type: Number, required: true },
    slipUnitPrice: { type: Number, default: null },
    slipTotal: { type: Number, default: null },
    matchKind: { type: String, enum: ["exact", "suggested", "none"], default: "none" },
    productId: { type: Schema.Types.ObjectId, ref: "PosProduct" },
    productName: { type: String },
    hsCode: { type: String, default: "" },
    issues: { type: [String], default: [] },
  },
  { _id: false }
);

const DespatchScanSchema = new Schema<IDespatchScan>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    tillId: { type: Schema.Types.ObjectId, ref: "Till" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["processing", "ready", "failed", "applied", "dismissed"],
      default: "processing",
    },
    processingError: { type: String },
    image: { type: Buffer, select: false },
    imageMime: { type: String, required: true },
    imageBytes: { type: Number, required: true },
    imageHash: { type: String, required: true },
    slipNumber: { type: String },
    slipNumberKey: { type: String },
    customerName: { type: String },
    customerTin: { type: String },
    customerEmail: { type: String },
    pricesIncludeVat: { type: Boolean, default: null },
    slipGrandTotal: { type: Number, default: null },
    currency: { type: String, enum: ["USD", "ZWG", null], default: null },
    lines: { type: [LineSchema], default: [] },
    warnings: { type: [String], default: [] },
    aiModel: { type: String },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
    appliedAt: { type: Date },
    appliedBy: { type: Schema.Types.ObjectId, ref: "User" },
    saleId: { type: Schema.Types.ObjectId, ref: "PosSale" },
  },
  { timestamps: true }
);

// The till's inbox: newest ready scans for a branch.
DespatchScanSchema.index({ branchId: 1, status: 1, createdAt: -1 });
// Duplicate-slip lookups.
DespatchScanSchema.index({ branchId: 1, slipNumberKey: 1 });
DespatchScanSchema.index({ branchId: 1, imageHash: 1 });
// Photos are an audit aid, not a record of the sale (the sale keeps the slip number): drop scans after a year.
DespatchScanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const DespatchScan = models?.DespatchScan || model<IDespatchScan>("DespatchScan", DespatchScanSchema);

export default DespatchScan;
