import FiscalAlertSettings, { type IFiscalAlertSettings } from "@/database/fiscalAlertSettings.model";
import User from "@/database/user.model";
import dbConnect from "@/lib/mongoose";

export type FiscalAlertSettingsView = Pick<IFiscalAlertSettings, "recipientMode" | "userIds" | "extraEmails">;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getFiscalAlertSettings(): Promise<FiscalAlertSettingsView> {
  await dbConnect();
  const d = await FiscalAlertSettings.findOne({ key: "default" }).lean<IFiscalAlertSettings | null>();
  return { recipientMode: d?.recipientMode ?? "all_admins", userIds: d?.userIds ?? [], extraEmails: d?.extraEmails ?? [] };
}

export async function saveFiscalAlertSettings(input: FiscalAlertSettingsView): Promise<FiscalAlertSettingsView> {
  await dbConnect();
  const extraEmails = [...new Set(input.extraEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = extraEmails.find((e) => !EMAIL.test(e));
  if (bad) throw new Error(`"${bad}" is not a valid email address`);
  let userIds: string[] = [];
  if (input.recipientMode === "selected") {
    const admins = await User.find({ _id: { $in: input.userIds }, role: "admin" }).select("_id").lean<{ _id: unknown }[]>();
    userIds = admins.map((a) => String(a._id));
    if (!userIds.length && !extraEmails.length) throw new Error("Choose at least one administrator or add an email address");
  }
  await FiscalAlertSettings.updateOne({ key: "default" }, { $set: { recipientMode: input.recipientMode, userIds, extraEmails } }, { upsert: true });
  return getFiscalAlertSettings();
}

/** The addresses to email. FISCAL_ALERT_EMAILS (older setting) is still honoured and always added. */
export async function resolveFiscalAlertRecipients(): Promise<string[]> {
  const s = await getFiscalAlertSettings();
  const fromEnv = (process.env.FISCAL_ALERT_EMAILS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const filter = s.recipientMode === "selected" ? { _id: { $in: s.userIds }, role: "admin" } : { role: "admin" };
  const users = await User.find(filter).select("email").lean<{ email: string }[]>();
  return [...new Set([...users.map((u) => u.email), ...s.extraEmails, ...fromEnv].filter(Boolean).map((e) => e.toLowerCase()))];
}
