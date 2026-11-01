import QRCode from "qrcode";
import { Types } from "mongoose";

import PosSale from "@/database/posSale.model";
import { sendPosInvoiceEmail } from "@/lib/email";
import logger from "@/lib/logger";
import { a4MissingElements, renderA4Pdf } from "@/lib/pos/a4Pdf";
import { a4Title } from "@/lib/pos/a4";
import { isFiscalSlip, type SlipSale } from "@/lib/pos/slip";
import dbConnect from "@/lib/mongoose";
import { getPosBranch } from "@/lib/services/posBranch.service";

/** An invoice is never sent more than this many times in total (matches the manual email route). */
export const MAX_EMAILS_PER_SALE = 10;
const MAX_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;
/** A send that has been "in progress" longer than this is assumed to have died with its worker. */
const STALE_SENDING_MS = 3 * 60_000;

/** A problem retrying cannot fix (missing seller TIN, email cap reached, ...). */
export class InvoiceEmailError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

/**
 * Render the sale's A4 tax invoice as a PDF and email it. Only a fiscalised sale with every mandatory
 * element may go out; anything else is refused here rather than sending an invalid tax invoice.
 */
export async function emailSaleInvoicePdf(saleId: string, to: string): Promise<void> {
  await dbConnect();
  const sale = await PosSale.findById(saleId);
  if (!sale) throw new InvoiceEmailError("Sale not found", false);
  if ((sale.emailedTo?.length ?? 0) >= MAX_EMAILS_PER_SALE) throw new InvoiceEmailError("Email limit reached for this sale", false);

  const slip = sale.toObject() as unknown as SlipSale;
  if (!isFiscalSlip(slip)) throw new InvoiceEmailError("The sale is not fiscalised yet", true);

  const branch = await getPosBranch(String(sale.branchId));
  const profile = branch?.pos.receipt ?? {};
  const missing = a4MissingElements(slip, profile);
  if (missing.length) {
    throw new InvoiceEmailError(`The invoice is missing: ${missing.join(", ")}. Complete the POS settings or the customer details.`, false);
  }

  const qrPng = await QRCode.toBuffer(slip.fiscal!.qrCodeUrl!, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  const pdf = await renderA4Pdf(slip, profile, { qrPng });
  const number = sale.invoiceNumber ?? slip.fiscal?.receiptGlobalNo ?? "invoice";
  const company = profile.companyName ?? "";

  await sendPosInvoiceEmail({
    to,
    subject: `${a4Title(slip)} ${number}${company ? ` - ${company}` : ""}`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#18181b;line-height:1.5">
<p>Dear ${escapeHtml(slip.buyer?.registerName ?? "customer")},</p>
<p>Your ZIMRA fiscal tax invoice <b>${escapeHtml(number)}</b>${company ? ` from ${escapeHtml(company)}` : ""} is attached as a PDF.
It carries the fiscal device ID, verification code and QR code, and may be used as your tax invoice.</p>
<p style="color:#71717a;font-size:12px">${company ? escapeHtml(company) : ""}</p></div>`,
    fromName: company || undefined,
    attachments: [{ filename: `${a4Title(slip).replace(/\s+/g, "-")}-${number}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  await PosSale.updateOne({ _id: sale._id }, { $addToSet: { emailedTo: to } });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Work on one sale's pending invoice email. Safe to call from several places at once: the claim below
 * lets exactly one caller send. A sale that is not fiscalised yet is simply left pending.
 */
export async function processPendingInvoiceEmail(saleId: string): Promise<"sent" | "waiting" | "failed" | "skipped"> {
  await dbConnect();
  if (!Types.ObjectId.isValid(saleId)) return "skipped";
  const now = new Date();

  const claimed = await PosSale.findOneAndUpdate(
    {
      _id: new Types.ObjectId(saleId),
      "emailRequest.status": "pending",
      $and: [
        { $or: [{ "emailRequest.sendingAt": { $exists: false } }, { "emailRequest.sendingAt": null }, { "emailRequest.sendingAt": { $lt: new Date(now.getTime() - STALE_SENDING_MS) } }] },
        { $or: [{ "emailRequest.nextAttemptAt": { $exists: false } }, { "emailRequest.nextAttemptAt": null }, { "emailRequest.nextAttemptAt": { $lte: now } }] },
      ],
    },
    { $set: { "emailRequest.sendingAt": now } },
    { new: true }
  );
  if (!claimed?.emailRequest) return "skipped";

  const release = (set: Record<string, unknown>) => PosSale.updateOne({ _id: claimed._id }, { $set: set, $unset: { "emailRequest.sendingAt": "" } });

  // The sale can no longer be fiscalised: there is no tax invoice to send.
  if (claimed.status === "FAILED" || claimed.status === "VOIDED") {
    await release({ "emailRequest.status": "failed", "emailRequest.lastError": `Sale is ${claimed.status.toLowerCase()}; no tax invoice to send` });
    return "failed";
  }
  // Still waiting for the fiscal device: nothing to send yet, and this is not a failed attempt.
  if (claimed.status !== "FISCALISED") {
    await release({ "emailRequest.nextAttemptAt": new Date(now.getTime() + BACKOFF_BASE_MS) });
    return "waiting";
  }

  const attempts = claimed.emailRequest.attempts + 1;
  try {
    await emailSaleInvoicePdf(String(claimed._id), claimed.emailRequest.to);
    await release({ "emailRequest.status": "sent", "emailRequest.sentAt": new Date(), "emailRequest.attempts": attempts, "emailRequest.lastError": "" });
    return "sent";
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not send the invoice";
    const retryable = !(e instanceof InvoiceEmailError) || e.retryable;
    if (!retryable || attempts >= MAX_ATTEMPTS) {
      logger.error({ saleId, err: e }, "Invoice email gave up");
      await release({ "emailRequest.status": "failed", "emailRequest.attempts": attempts, "emailRequest.lastError": message });
      return "failed";
    }
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
    await release({ "emailRequest.attempts": attempts, "emailRequest.lastError": message, "emailRequest.nextAttemptAt": new Date(now.getTime() + delay) });
    return "waiting";
  }
}

/** The retry sweep run with the fiscal queue: every invoice email that is due. */
export async function sendPendingInvoiceEmails(limit = 10): Promise<{ sent: number; failed: number; waiting: number }> {
  await dbConnect();
  const now = new Date();
  const due = await PosSale.find({
    "emailRequest.status": "pending",
    $or: [{ "emailRequest.nextAttemptAt": { $exists: false } }, { "emailRequest.nextAttemptAt": null }, { "emailRequest.nextAttemptAt": { $lte: now } }],
  })
    .select("_id")
    .sort({ "emailRequest.requestedAt": 1 })
    .limit(limit)
    .lean<{ _id: Types.ObjectId }[]>();

  const out = { sent: 0, failed: 0, waiting: 0 };
  for (const s of due) {
    const r = await processPendingInvoiceEmail(String(s._id));
    if (r === "sent") out.sent++;
    else if (r === "failed") out.failed++;
    else if (r === "waiting") out.waiting++;
  }
  return out;
}
