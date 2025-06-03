import { Decimal128, Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IWeeklyProductSummaries {
  // branchId:Types.ObjectId;
  productId:Types.ObjectId;
  code:string;
  week:number;
  year:number;
  startQuantity:number;
  endQuantity:number;
  estimatedSales:Decimal128;
  restocked:boolean;
  restockAmount:number;
}

export interface IWeeklyProductSummariesDoc extends IWeeklyProductSummaries, Document {}
// validation for the backend
// validation for the mongoose schema
const WeeklyProductSummariesSchema = new Schema<IWeeklyProductSummaries>(
  {
    // branchId: { type: Schema.Types.ObjectId, required: true, ref: "Branch" },
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
    code: { type: String, required: true },
    week: { type: Number, required: true },
    year: { type: Number, required: true },
    startQuantity: { type: Number, required: true },
    endQuantity: { type: Number, required: false , default:null},
    estimatedSales: { type: Schema.Types.Decimal128, required: false, default: Types.Decimal128.fromString("0.00") },
    restocked: { type: Boolean, required: true },
    restockAmount: { type: Number, required: true },
  },
  {
    timestamps: true,
  }
);
const WeeklyProductSummaries = models?.WeeklyProductSummaries || model<IWeeklyProductSummaries>("WeeklyProductSummaries", WeeklyProductSummariesSchema);

export default WeeklyProductSummaries;
