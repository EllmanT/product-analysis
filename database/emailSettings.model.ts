import { Document, model, models, Schema } from "mongoose";

/** Singleton-style outbound email and notification preferences (admin-editable). */
export interface IEmailSettings {
  /** Optional SMTP override; blanks fall back to env. */
  smtpHost?: string;
  smtpPort?: number;
  /** When true, use SMTP implicit TLS (typically port 465). When false, infer from port. */
  smtpTlsImplicit?: boolean;  smtpUser?: string;
  smtpPassword?: string;

  fromName?: string;
  fromAddress?: string;

  /** Base URL for links in transactional emails (trailing slashes stripped client-side when joining paths). */
  publicSiteUrl?: string;

  sendCustomerQuotationEmail: boolean;
  notifyAdminsNewQuotation: boolean;
  sendCustomerInvoiceEmail: boolean;
  notifyAdminsInvoiceSent: boolean;

  adminQuotationRecipients: string[];
  adminInvoiceRecipients: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IEmailSettingsDoc extends IEmailSettings, Document {}

const EmailSettingsSchema = new Schema<IEmailSettings>(
  {
    smtpHost: { type: String },
    smtpPort: { type: Number },
    smtpTlsImplicit: { type: Boolean, default: false },    smtpUser: { type: String },
    smtpPassword: { type: String },
    fromName: { type: String },
    fromAddress: { type: String },
    publicSiteUrl: { type: String },
    sendCustomerQuotationEmail: { type: Boolean, default: true },
    notifyAdminsNewQuotation: { type: Boolean, default: true },
    sendCustomerInvoiceEmail: { type: Boolean, default: true },
    notifyAdminsInvoiceSent: { type: Boolean, default: true },
    adminQuotationRecipients: { type: [String], default: [] },
    adminInvoiceRecipients: { type: [String], default: [] },
  },
  { timestamps: true }
);

const EmailSettings =
  models?.EmailSettings || model<IEmailSettings>("EmailSettings", EmailSettingsSchema);

export default EmailSettings;
