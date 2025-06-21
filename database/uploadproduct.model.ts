import { Decimal128, Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IUploadProduct {
  uploadId:Types.ObjectId;
  storeId:Types.ObjectId;
  productId:Types.ObjectId;
  branchId:Types.ObjectId;
  name:string;
  code:string;
  qty:number;
  price:Decimal128;
    upload_date:Date;
  week: number;
  month:string;
  year: number;

 
 
}

export interface IUploadProductDoc extends IUploadProduct, Document {}
// validation for the backend
// validation for the mongoose schema
const UploadProductSchema = new Schema<IUploadProduct>(
  {
    uploadId: { type: Schema.Types.ObjectId, required: true, ref: "Upload" },
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
    storeId: { type: Schema.Types.ObjectId, required: true, ref: "Store" },
    branchId: { type: Schema.Types.ObjectId, required: true, ref: "Branch" },
    name: { type: String, required: true },
    code: { type: String, required: true },
    qty: { type: Number, required: true },
    price: { type: Schema.Types.Decimal128, required: true },
        upload_date: { type: Date, required: true },
    week: { type: Number, required: true },
    month: { type: String, required: true },
    year: { type: Number, required: true },

  },
  {
    timestamps: true,
  }
);
const UploadProduct = models?.UploadProduct || model<IUploadProduct>("UploadProduct", UploadProductSchema);

export default UploadProduct;
