import { Document, model, models, Schema } from "mongoose";

export type CustomerBuyerType = "individual" | "business";

export interface ICustomer {
  /** Clerk `user_...` when the account uses shop Clerk auth */
  clerkUserId?: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Bcrypt; only for legacy email/password before Clerk */
  password?: string;
  phone: string;
  tradeName: string;
  tinNumber: string;
  vatNumber: string;
  address: string;
  buyerType: CustomerBuyerType;
  resetOtp?: string;
  resetOtpExpiry?: Date;
  resetOtpVerified?: boolean;
}

export interface ICustomerDoc extends ICustomer, Document {}

const CustomerSchema = new Schema<ICustomer>(
  {
    clerkUserId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false },
    phone: { type: String, default: "" },
    tradeName: { type: String, default: "" },
    tinNumber: { type: String, default: "" },
    vatNumber: { type: String, default: "" },
    address: { type: String, default: "" },
    buyerType: {
      type: String,
      enum: ["individual", "business"] satisfies CustomerBuyerType[],
      default: "individual",
    },
    resetOtp: { type: String },
    resetOtpExpiry: { type: Date },
    resetOtpVerified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const Customer =
  models?.Customer || model<ICustomer>("Customer", CustomerSchema);

export default Customer;
