import nodemailer from "nodemailer";

/**
 * Send a transactional email.
 * Env vars (EMAIL_* preferred, falls back to SMTP_* used by lib/email.ts):
 *   EMAIL_HOST / SMTP_HOST
 *   EMAIL_PORT / SMTP_PORT
 *   EMAIL_USER / SMTP_USER
 *   EMAIL_PASS / SMTP_PASSWORD
 *   EMAIL_FROM / SMTP_FROM
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const host = process.env.EMAIL_HOST ?? process.env.SMTP_HOST;
  const port = Number(process.env.EMAIL_PORT ?? process.env.SMTP_PORT) || 587;
  const user = process.env.EMAIL_USER ?? process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS ?? process.env.SMTP_PASSWORD;
  const from =
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    '"StockFlow" <noreply@stockflow.com>';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  console.log(`[Email] Sent to: ${options.to} Subject: ${options.subject}`);
}
