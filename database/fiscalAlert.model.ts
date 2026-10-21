import { model, models, Schema } from "mongoose";

/** One row per alert already sent. The unique `key` (e.g. `close-deferred:2026-10-09`) stops repeats. */
export interface IFiscalAlert {
  key: string;
  subject: string;
  sentTo: string[];
}

const FiscalAlertSchema = new Schema<IFiscalAlert>(
  {
    key: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    sentTo: { type: [String], default: [] },
  },
  { timestamps: true }
);

const FiscalAlert = models?.FiscalAlert || model<IFiscalAlert>("FiscalAlert", FiscalAlertSchema);
export default FiscalAlert;
