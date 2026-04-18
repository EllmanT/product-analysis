import { z } from "zod";
import { NextResponse } from "next/server";

import Customer from "@/database/customer.model";
import Invoice from "@/database/invoice.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { NotFoundError, RequestError, ValidationError } from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { sendEmail } from "@/lib/utils/sendEmail";
import { invoiceEmailTemplate } from "@/lib/utils/emailTemplates";
import { generateInvoice } from "@/lib/services/invoice.service";
import type { IQuotationItem } from "@/database/quotation.model";

const PAGE_SIZE = 20;

const PostSchema = z.object({
  quotationId: z.string().min(1),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  taxInclusive: z.boolean().optional(),
  receiptType: z.enum(["FiscalInvoice", "CreditNote", "DebitNote"]).optional(),
  receiptNotes: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") ?? "all";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

    const filter: Record<string, unknown> = {};
    if (statusFilter !== "all" && ["draft", "sent", "DRAFT", "SUBMITTED"].includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await Invoice.countDocuments(filter);
    const rows = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate({ path: "customerId", select: "firstName lastName tradeName", model: Customer })
      .lean();

    const data = rows.map((inv) => {
      const c = inv.customerId as unknown as {
        firstName?: string;
        lastName?: string;
        tradeName?: string;
      } | null;
      const customerName = c
        ? c.tradeName || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "—"
        : "—";
      return {
        id: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        quotationId: String(inv.quotationId),
        customerName,
        createdAt: inv.createdAt,
        subtotal: inv.subtotal,
        totalAmount: inv.totalAmount,
        totalVat: inv.totalVat,
        status: inv.status,
        isFiscalized: inv.isFiscalized,
        fiscalStatus: inv.fiscalStatus,
        fiscalSubmittedAt: inv.fiscalSubmittedAt,
      };
    });

    return NextResponse.json({ success: true, data: { rows: data, total, page, pageSize: PAGE_SIZE } }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const json = await request.json();
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const { quotationId, paymentMethod, taxInclusive, receiptType, receiptNotes } = parsed.data;

    let inv;
    try {
      inv = await generateInvoice(quotationId, { paymentMethod, taxInclusive, receiptType, receiptNotes });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate invoice";
      if (msg.includes("not found")) throw new NotFoundError("Quotation");
      if (msg.includes("confirmed")) throw new RequestError(400, msg);
      throw new RequestError(400, msg);
    }

    // Send invoice email to customer (non-blocking)
    try {
      await dbConnect();
      const freshCustomer = await Customer.findById(inv.customerId).select("firstName email");
      if (freshCustomer?.email) {
        const itemsForEmail = inv.items.map((row: IQuotationItem) => ({
          name: row.name,
          quantity: row.quantity,
          unitPrice: parseFloat(row.unitPrice) || 0,
          lineTotal: parseFloat(row.lineTotal) || 0,
        }));
        const html = invoiceEmailTemplate({
          customerFirstName: freshCustomer.firstName,
          invoiceId: String(inv._id),
          invoiceNumber: inv.invoiceNumber,
          items: itemsForEmail,
          subtotal: parseFloat(inv.subtotal) || 0,
          total: inv.totalAmount || parseFloat(inv.subtotal) || 0,
          siteUrl: process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "",
        });
        await sendEmail({
          to: freshCustomer.email,
          subject: `Invoice ${inv.invoiceNumber} from StockFlow`,
          html,
        });
      }
    } catch (emailError) {
      console.error("[Invoice Email] Failed to send customer invoice email:", emailError);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          _id: String(inv._id),
          invoiceNumber: inv.invoiceNumber,
          quotationId: String(inv.quotationId),
          customerId: String(inv.customerId),
          items: inv.items,
          subtotal: inv.subtotal,
          totalAmount: inv.totalAmount,
          totalVat: inv.totalVat,
          fiscalStatus: inv.fiscalStatus,
          isFiscalized: inv.isFiscalized,
          status: inv.status,
          createdAt: inv.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
