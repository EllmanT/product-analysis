import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { emailSaleInvoicePdf, InvoiceEmailError } from "@/lib/services/posInvoiceEmail.service";

const Body = z.object({ to: z.string().trim().email().max(200) }).strict();

export const runtime = "nodejs";
export const maxDuration = 60;

/** Send (or resend) the A4 tax invoice PDF of a fiscalised sale. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const { id } = await context.params;
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });
    if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    await dbConnect();
    const sale = await PosSale.findById(id).select("branchId");
    if (!sale || (scoped.scope.branchId && String(sale.branchId) !== scoped.scope.branchId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    await emailSaleInvoicePdf(id, body.data.to);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvoiceEmailError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.retryable ? 409 : 422 });
    }
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to send the invoice" }, { status: 500 });
  }
}
