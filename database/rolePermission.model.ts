import { Document, model, models, Schema, Types } from "mongoose";

/** What a role may open and do, as chosen by a super admin. No document = the role's preset. */
export interface IRolePermission {
  role: string;
  allowed: string[];
  updatedBy?: Types.ObjectId;
}

export interface IRolePermissionDoc extends IRolePermission, Document {}

const RolePermissionSchema = new Schema<IRolePermission>(
  {
    role: { type: String, required: true, unique: true },
    allowed: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const RolePermission = models?.RolePermission || model<IRolePermission>("RolePermission", RolePermissionSchema);

export default RolePermission;
