import { Document, model, models, Schema, Types } from "mongoose";
import ProductMaster, { IProductMaster } from "./productmaster.model";

// validation for the ide 
// validation for the developer while we type code
export interface IUpload {
  uploaded_by:Types.ObjectId;
  branchId:Types.ObjectId;
  upload_date:Date;
  week: number;
  month:string;
  year: number;
  file_name:string;
  products: IProductMaster[]
 
}

export interface IUploadDoc extends IUpload, Document {}
// validation for the backend
// validation for the mongoose schema
const UploadSchema = new Schema<IUpload>(
  {
    uploaded_by: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    branchId: { type: Schema.Types.ObjectId, required: true, ref: "Branch" },
    upload_date: { type: Date, required: true },
    week: { type: Number, required: true },
    month: { type: String, required: true },
    year: { type: Number, required: true },
    file_name: { type: String, required: true },
    products: { type: [ProductMaster], required: true },
  },
  {
    timestamps: true,
  }
);
const Upload = models?.Upload || model<IUpload>("Upload", UploadSchema);

export default Upload;
