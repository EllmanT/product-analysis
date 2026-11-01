import { Document, model, models, Schema } from "mongoose";

/**
 * A customer the tills can pick by name. Shared by every branch; kept apart from the online
 * shop's `Customer` (which needs a password / Clerk account). Mirrors RevAccounting's Client.
 */
export interface IPosCustomer {
  /** Registered name; this is what the cashier types and what prints as "Billed to". */
  name: string;
  tradeName?: string;
  tin?: string;
  vatNumber?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

export interface IPosCustomerDoc extends IPosCustomer, Document {}

const PosCustomerSchema = new Schema<IPosCustomer>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    tradeName: { type: String, trim: true, maxlength: 200 },
    tin: { type: String, trim: true, maxlength: 40 },
    vatNumber: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PosCustomerSchema.index({ isActive: 1, name: 1 });

const PosCustomer = models?.PosCustomer || model<IPosCustomer>("PosCustomer", PosCustomerSchema);
export default PosCustomer;
