import { Document, model, models, Schema } from "mongoose";

export interface ICustomer {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  tradeName: string;
  tinNumber: string;
  vatNumber: string;
  address: string;
  resetOtp?: string;
  resetOtpExpiry?: Date;
  resetOtpVerified?: boolean;
}

export interface ICustomerDoc extends ICustomer, Document {}

const CustomerSchema = new Schema<ICustomer>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    tradeName: { type: String, required: true },
    tinNumber: { type: String, required: true },
    vatNumber: { type: String, required: true },
    address: { type: String, required: true },
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
