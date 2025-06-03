import { Decimal128, Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IUpload {
  uploadedBy:Types.ObjectId;
  upload_date:Date;
  week: number;
  month:string;
  year: number;
  fileName:string;
  contentHash:string;
  products: [{ type: Schema.Types.ObjectId, ref: "UploadProduct", required: true }],
  totalProducts:number;
  estimatedValue:Decimal128;
 
}


export interface IUploadDoc extends IUpload, Document {}
// validation for the backend
// validation for the mongoose schema
const UploadSchema = new Schema<IUpload>(
  {
    uploadedBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    // branchId: { type: Schema.Types.ObjectId, required: true, ref: "Branch" },
    upload_date: { type: Date, required: true },
    week: { type: Number, required: true },
    month: { type: String, required: true },
    year: { type: Number, required: true },
    fileName: { type: String, required: true },
    contentHash: { type: String,required: true, unique: true}, // enforce one-time uploads for same content
    products: [{ type: Schema.Types.ObjectId, ref: "UploadProduct", required: true }],
    totalProducts:{type:Number, required:true},
    estimatedValue:{type:Schema.Types.Decimal128, required:true}

  },
  {
    timestamps: true,
  }
);
const Upload = models?.Upload || model<IUpload>("Upload", UploadSchema);

export default Upload;
