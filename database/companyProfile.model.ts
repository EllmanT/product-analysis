import { Document, model, models, Schema } from "mongoose";

/**
 * The one company profile every slip, A4 invoice and invoice email reads. Typed by hand by an administrator:
 * what a receipt shows is the company's decision, not something copied from ZIMRA's records.
 */
export interface ICompanyProfile {
  /** Registered name, printed at the top of every slip. */
  companyName?: string;
  tradeName?: string;
  tin?: string;
  vatNumber?: string;
  /** Head office. A branch that has no address, phone or email of its own prints these. */
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  footerLines?: string[];
}

export interface ICompanyProfileDoc extends ICompanyProfile, Document {}

const CompanyProfileSchema = new Schema<ICompanyProfile>(
  {
    companyName: { type: String, trim: true },
    tradeName: { type: String, trim: true },
    tin: { type: String, trim: true },
    vatNumber: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    footerLines: { type: [String], default: [] },
  },
  { timestamps: true }
);

const CompanyProfile = models?.CompanyProfile || model<ICompanyProfile>("CompanyProfile", CompanyProfileSchema);

export default CompanyProfile;
