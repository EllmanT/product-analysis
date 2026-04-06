import { Document, model, models, Schema } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IProductMaster {
  name: string;
  standardCode: string;
  aliases?: string[];
  isActive?: boolean;
  imageUrl?: string;
}

export interface IProductMasterDoc extends IProductMaster, Document {}
// validation for the backend
// validation for the mongoose schema
const ProductMasterSchema = new Schema<IProductMaster>(
  {
    name: { type: String, required: true },
    standardCode: { type: String, required: true },
    aliases: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String },
  },
  {
    timestamps: true,
  }
);

ProductMasterSchema.index({ name: 1 });
ProductMasterSchema.index({ standardCode: 1 });
ProductMasterSchema.index({ name: "text", standardCode: "text" });
ProductMasterSchema.index({ isActive: 1 });

const ProductMaster =
  models?.ProductMaster || model<IProductMaster>("ProductMaster", ProductMasterSchema);

export default ProductMaster;
