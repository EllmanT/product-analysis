import { Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IBranch {
  name: string;
  storeId:Types.ObjectId;
  location:string;
}

export interface IBranchDoc extends IBranch, Document {}
// validation for the backend
// validation for the mongoose schema
const BranchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true },
        storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
        location:{type:String, required:true}

  },
  {
    timestamps: true,
  }
);
const Branch = models?.Branch || model<IBranch>("Branch", BranchSchema);

export default Branch;
