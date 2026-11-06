import { model, models, Schema } from "mongoose";

/**
 * Who receives fiscal alert emails. One document (key "default").
 * `all_admins`: every user with role admin (the default). `selected`: only the chosen admins in `userIds`.
 * `extraEmails` are added in both modes (an accountant, a support mailbox).
 */
export interface IFiscalAlertSettings {
  key: string;
  recipientMode: "all_admins" | "selected";
  userIds: string[];
  extraEmails: string[];
}

const FiscalAlertSettingsSchema = new Schema<IFiscalAlertSettings>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    recipientMode: { type: String, enum: ["all_admins", "selected"], default: "all_admins" },
    userIds: { type: [String], default: [] },
    extraEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

const FiscalAlertSettings = models?.FiscalAlertSettings || model<IFiscalAlertSettings>("FiscalAlertSettings", FiscalAlertSettingsSchema);
export default FiscalAlertSettings;
