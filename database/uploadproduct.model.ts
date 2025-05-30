import { Decimal128, Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IUploadProduct {
  uploadId:Types.ObjectId;
  productId:Types.ObjectId;
  name:string;
  code:string;
  qty:number;
  price:Decimal128;
 
 
}

export interface IUploadProductDoc extends IUploadProduct, Document {}
// validation for the backend
// validation for the mongoose schema
const UploadProductSchema = new Schema<IUploadProduct>(
  {
    uploadId: { type: Schema.Types.ObjectId, required: true, ref: "Upload" },
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
    name: { type: String, required: true },
    code: { type: String, required: true },
    qty: { type: Number, required: true },
    price: { type: Schema.Types.Decimal128, required: true },
  },
  {
    timestamps: true,
  }
);
const UploadProduct = models?.UploadProduct || model<IUploadProduct>("UploadProduct", UploadProductSchema);

export default UploadProduct;
