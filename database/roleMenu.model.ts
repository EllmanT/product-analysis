import { Document, model, models, Schema, Types } from "mongoose";

/** Menu pages hidden from a role. Absent document = the role sees everything it is allowed to use. */
export interface IRoleMenu {
  role: string;
  hiddenUrls: string[];
  updatedBy?: Types.ObjectId;
}

export interface IRoleMenuDoc extends IRoleMenu, Document {}

const RoleMenuSchema = new Schema<IRoleMenu>(
  {
    role: { type: String, required: true, unique: true },
    hiddenUrls: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const RoleMenu = models?.RoleMenu || model<IRoleMenu>("RoleMenu", RoleMenuSchema);

export default RoleMenu;
