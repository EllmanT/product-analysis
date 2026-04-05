import { Document, model, models, Schema, Types } from "mongoose";

export interface IAccount{
    userId: Types.ObjectId;
    name:string;
    image?:string;
    password?:string;
    provider:string;
    providerAccountId:string;
    resetOtp?: string;
    resetOtpExpiry?: Date;
    resetOtpVerified?: boolean;
}

export interface IAccountDoc extends IAccount, Document {}
const AccountSchema = new Schema<IAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name:{type:String, required:true},
    image: { type: String },
    password:{type:String},
    provider: { type: String },
    providerAccountId: { type: String },
    resetOtp: { type: String },
    resetOtpExpiry: { type: Date },
    resetOtpVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Account = models?.Account || model<IAccount>("Account", AccountSchema);

export default Account;
