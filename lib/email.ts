import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendPasswordResetOtp(email: string, otp: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"StockFlow" <noreply@stockflow.com>',
    to: email,
    subject: "Your Password Reset Code – StockFlow",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">StockFlow</h1>
          <p style="color: #6b7280; margin-top: 4px; font-size: 14px;">Password Reset</p>
        </div>

        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          You requested a password reset. Use the verification code below. It expires in <strong>10 minutes</strong>.
        </p>

        <div style="display: flex; justify-content: center; margin: 28px 0;">
          <div style="background: #f3f4f6; border-radius: 10px; padding: 20px 36px; text-align: center; letter-spacing: 10px; font-size: 32px; font-weight: 700; color: #111827; font-family: monospace;">
            ${otp}
          </div>
        </div>

        <p style="color: #6b7280; font-size: 13px; text-align: center;">
          If you did not request this, you can safely ignore this email. Your password will not change.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} StockFlow. All rights reserved.</p>
      </div>
    `,
  });
}
