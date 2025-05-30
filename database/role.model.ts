import { Document, model, models, Schema } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IRole {
  name: string;
}

export interface IRoleDoc extends IRole, Document {}
// validation for the backend
// validation for the mongoose schema
const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);
const Role = models?.Role || model<IRole>("Role", RoleSchema);

export default Role;
