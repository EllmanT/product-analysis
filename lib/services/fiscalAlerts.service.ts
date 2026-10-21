import FiscalAlert from "@/database/fiscalAlert.model";
import User from "@/database/user.model";
import { sendAdminAlertEmail } from "@/lib/email";
import logger from "@/lib/logger";
import dbConnect from "@/lib/mongoose";

async function recipients(): Promise<string[]> {
  const fromEnv = (process.env.FISCAL_ALERT_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const admins = await User.find({ role: "admin" }).select("email").lean<{ email: string }[]>();
  return admins.map((a) => a.email).filter(Boolean);
}

/**
 * Email the administrators once per `key`. The key is claimed in the database first, so
 * simultaneous cron runs cannot send it twice. If the email itself fails the claim is released
 * so the next run tries again. Never throws: an alert problem must not break the fiscal job.
 */
export async function sendFiscalAlertOnce(key: string, subject: string, text: string): Promise<boolean> {
  try {
    await dbConnect();
    try {
      await FiscalAlert.create({ key, subject, sentTo: [] });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false; // already sent
      throw e;
    }
    const to = await recipients();
    try {
      if (!to.length) throw new Error("no administrator email addresses");
      await sendAdminAlertEmail({ to, subject: `[Fiscal] ${subject}`, text });
      await FiscalAlert.updateOne({ key }, { $set: { sentTo: to } });
      return true;
    } catch (e) {
      await FiscalAlert.deleteOne({ key });
      logger.error({ key, err: e instanceof Error ? e.message : String(e) }, "Fiscal alert email failed");
      return false;
    }
  } catch (e) {
    logger.error({ key, err: e instanceof Error ? e.message : String(e) }, "Fiscal alert failed");
    return false;
  }
}
