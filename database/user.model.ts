import { Document, model, models, Schema, Types } from "mongoose";

// validation for the ide 
// validation for the developer while we type code
export interface IUser {
  name: string;
  surname: string;
  email: string;
  image?: string;
  storeId?:Types.ObjectId;
  branchId?:Types.ObjectId;
}

export interface IUserDoc extends IUser, Document {}
// validation for the backend
// validation for the mongoose schema
const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    surname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    storeId: { type: Schema.Types.ObjectId, ref: "Store" },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },

  },
  {
    timestamps: true,
  }
);
const User = models?.User || model<IUser>("User", UserSchema);

export default User;
