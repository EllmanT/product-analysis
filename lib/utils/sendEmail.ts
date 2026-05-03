import nodemailer from "nodemailer";

import { getEmailSettingsDoc } from "@/lib/services/emailSettings.service";
import type { IEmailSettingsDoc } from "@/database/emailSettings.model";

function buildTransportOptions(doc: IEmailSettingsDoc): {
  host?: string;
  port: number;
  secure: boolean;
  auth: { user?: string; pass?: string };
} {
  const host =
    doc.smtpHost?.trim() ||
    process.env.EMAIL_HOST?.trim() ||
    process.env.SMTP_HOST?.trim();
  const envPort = Number(process.env.EMAIL_PORT ?? process.env.SMTP_PORT);
  const port =
    typeof doc.smtpPort === "number" && Number.isFinite(doc.smtpPort)
      ? doc.smtpPort
      : envPort || 587;
  const secure =
    doc.smtpTlsImplicit === true ? true : port === 465;

  const user =
    doc.smtpUser?.trim() ||
    process.env.EMAIL_USER?.trim() ||
    process.env.SMTP_USER?.trim();
  const storedPass = doc.smtpPassword?.trim();
  const pass =
    storedPass && storedPass.length > 0
      ? storedPass
      : process.env.EMAIL_PASS?.trim() || process.env.SMTP_PASSWORD?.trim();

  return {
    ...(host ? { host } : {}),
    port,
    secure,
    auth: user || pass ? { ...(user ? { user } : {}), ...(pass ? { pass } : {}) } : {},
  };
}

function buildFromHeader(doc: IEmailSettingsDoc): string {
  const addr = doc.fromAddress?.trim();
  const name = doc.fromName?.trim();
  if (addr && name) return `"${name.replace(/"/g, "\\\"")}" <${addr}>`;
  if (addr) return addr;
  return (
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    '"StockFlow" <noreply@stockflow.com>'
  );
}

/**
 * Send a transactional email using Mongo EmailSettings merged with env.
 * Env vars when DB fields blank (EMAIL_* preferred):
 *   EMAIL_HOST / SMTP_HOST
 *   EMAIL_PORT / SMTP_PORT
 *   EMAIL_USER / SMTP_USER
 *   EMAIL_PASS / SMTP_PASSWORD
 *   EMAIL_FROM / SMTP_FROM
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  const doc = await getEmailSettingsDoc();
  const opts = buildTransportOptions(doc);
  const from = buildFromHeader(doc);

  const transporter = nodemailer.createTransport({
    ...opts,
  });

  const recipients = Array.isArray(options.to)
    ? options.to.filter((x) => typeof x === "string" && x.trim())
    : typeof options.to === "string" && options.to.trim()
      ? [options.to.trim()]
      : [];
  if (recipients.length === 0) return;

  await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject: options.subject,
    html: options.html,
  });

  console.log(`[Email] Sent to: ${recipients.join(", ")} Subject: ${options.subject}`);
}
