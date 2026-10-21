import { model, models, Schema } from "mongoose";

/** Append-only audit trail for certificate changes. Never holds key material. */
export interface IFiscalCertEvent {
  action: "upload_pem" | "upload_pfx" | "clear_pem" | "clear_pfx" | "encrypt_migration" | "renew" | "renew_failed";
  actorId?: string;
  actorEmail?: string;
  certSerial?: string;
  certNotAfter?: Date;
  detail?: string;
  createdAt?: Date;
}

const FiscalCertEventSchema = new Schema<IFiscalCertEvent>(
  {
    action: { type: String, required: true },
    actorId: { type: String },
    actorEmail: { type: String },
    certSerial: { type: String },
    certNotAfter: { type: Date },
    detail: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const FiscalCertEvent =
  models?.FiscalCertEvent || model<IFiscalCertEvent>("FiscalCertEvent", FiscalCertEventSchema);
export default FiscalCertEvent;
