import { Document, model, models, Schema } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IProductMaster {
  name: string;
  standardCode:string;
  aliases?:string[];
}

export interface IProductMasterDoc extends IProductMaster, Document {}
// validation for the backend
// validation for the mongoose schema
const ProductMasterSchema = new Schema<IProductMaster>(
  {
    name: { type: String, required: true },
    standardCode:{type:String, required:true},
    aliases:{type:[String], default:[]}
  },
  {
    timestamps: true,
  }
);
const ProductMaster = models?.ProductMaster || model<IProductMaster>("ProductMaster", ProductMasterSchema);

export default ProductMaster;
