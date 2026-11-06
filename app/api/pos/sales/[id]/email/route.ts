import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { sendPosInvoiceEmail } from "@/lib/email";
import { a4BodyHtml, a4Title } from "@/lib/pos/a4";
import { isFiscalSlip, slipBodyHtml, SLIP_CSS, type SlipSale } from "@/lib/pos/slip";
import dbConnect from "@/lib/mongoose";
import { getPosBranch } from "@/lib/services/posBranch.service";

const Body = z.object({ to: z.string().trim().email().max(200), format: z.enum(["a4", "slip"]).optional() }).strict();
const MAX_EMAILS_PER_SALE = 10;

/** Email the slip (fiscal invoice, or the provisional receipt until it is fiscalised). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;

    const { id } = await context.params;
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });
    }
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    await dbConnect();
    const sale = await PosSale.findById(id);
    if (!sale || (scope.branchId && String(sale.branchId) !== scope.branchId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    if (!["FISCALISED", "UNFISCALISED", "UNKNOWN"].includes(sale.status)) {
      return NextResponse.json({ success: false, message: "This sale has no receipt to send" }, { status: 409 });
    }
    if ((sale.emailedTo?.length ?? 0) >= MAX_EMAILS_PER_SALE) {
      return NextResponse.json({ success: false, message: "Email limit reached for this sale" }, { status: 429 });
    }

    const branch = await getPosBranch(String(sale.branchId));
    const profile = branch?.pos.receipt ?? {};
    const slip = sale.toObject() as unknown as SlipSale;
    const fiscalSlip = isFiscalSlip(slip) && !!slip.fiscal?.qrCodeUrl;
    const number = sale.invoiceNumber ?? sale.provisionalNumber ?? "receipt";
    const format = body.data.format ?? "a4";

    let html: string;
    let attachments: { filename: string; content: Buffer; cid: string; contentType: string }[] | undefined;
    if (format === "a4") {
      // Gmail and Outlook block data: images, so the QR travels as an inline attachment.
      if (fiscalSlip) {
        const png = await QRCode.toBuffer(slip.fiscal!.qrCodeUrl!, { margin: 1, width: 320, errorCorrectionLevel: "M" });
        attachments = [{ filename: "verification-qr.png", content: png, cid: "invoice-qr", contentType: "image/png" }];
      }
      html = `<!doctype html><html><head><meta charset="utf-8"/></head><body style="margin:0;background:#f4f4f5;padding:16px">${a4BodyHtml(slip, profile, { qrSrc: fiscalSlip ? "cid:invoice-qr" : undefined })}</body></html>`;
    } else {
      const qrDataUrl = fiscalSlip ? await QRCode.toDataURL(slip.fiscal!.qrCodeUrl!, { margin: 0, width: 300, errorCorrectionLevel: "M" }) : undefined;
      html = `<!doctype html><html><head><meta charset="utf-8"/><style>${SLIP_CSS} body{background:#f4f4f5;padding:16px} .slip{background:#fff;padding:12px;border:1px solid #e4e4e7}</style></head><body>${slipBodyHtml(slip, profile, { qrDataUrl })}</body></html>`;
    }

    await sendPosInvoiceEmail({
      to: body.data.to,
      subject: `${a4Title(slip)} ${number}${profile.companyName ? ` - ${profile.companyName}` : ""}`,
      html,
      fromName: profile.companyName,
      attachments,
    });
    await PosSale.updateOne({ _id: id }, { $addToSet: { emailedTo: body.data.to } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
