import { Decimal128, Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IWeeklyProductSummaries {
  storeId:Types.ObjectId;
  branchId:Types.ObjectId;
  productId:Types.ObjectId;
  code:string;
  week:number;
  year:number;
  upload_date:Date;
  startQuantity:number;
  endQuantity:number;
  price:Decimal128;
  estimatedSales:Decimal128;
  restocked:boolean;
  restockAmount:number;
}

export interface IWeeklyProductSummariesDoc extends IWeeklyProductSummaries, Document {}
// validation for the backend
// validation for the mongoose schema
const WeeklyProductSummariesSchema = new Schema<IWeeklyProductSummaries>(
  {
    storeId: { type: Schema.Types.ObjectId, required: true, ref: "Store" },
    productId: { type: Schema.Types.ObjectId, required: true, ref: "ProductMaster" },
    code: { type: String, required: true },
    week: { type: Number, required: true },
    year: { type: Number, required: true },
    upload_date: { type: Date, required: true },
    branchId: { type: Schema.Types.ObjectId, required: true, ref: "Branch" },
    startQuantity: { type: Number, required: true },
    endQuantity: { type: Number, required: false , default:null},
        price: { type: Schema.Types.Decimal128, required: true },
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
