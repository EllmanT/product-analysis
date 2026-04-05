import { Types } from "mongoose";
import { z } from "zod";

import Customer from "@/database/customer.model";
import Invoice from "@/database/invoice.model";
import Quotation, { type IQuotationItem } from "@/database/quotation.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import {
  NotFoundError,
  RequestError,
  ValidationError,
} from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { sendEmail } from "@/lib/utils/sendEmail";
import { invoiceEmailTemplate } from "@/lib/utils/emailTemplates";
import { NextResponse } from "next/server";

const PAGE_SIZE = 20;

const PostSchema = z.object({
  quotationId: z.string().min(1),
});

function ymdCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

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
    if (statusFilter !== "all" && ["draft", "sent"].includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const total = await Invoice.countDocuments(filter);
    const rows = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate({
        path: "customerId",
        select: "firstName lastName tradeName",
        model: Customer,
      })
      .lean();

    const data = rows.map((inv) => {
      const c = inv.customerId as unknown as {
        firstName?: string;
        lastName?: string;
        tradeName?: string;
      } | null;
      const customerName = c
        ? c.tradeName ||
          [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
          "—"
        : "—";
      return {
        id: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        quotationId: String(inv.quotationId),
        customerName,
        createdAt: inv.createdAt,
        subtotal: inv.subtotal,
        status: inv.status,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          rows: data,
          total,
          page,
          pageSize: PAGE_SIZE,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();

    const json = await request.json();
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const { quotationId } = parsed.data;
    if (!Types.ObjectId.isValid(quotationId)) {
      throw new NotFoundError("Quotation");
    }

    const existing = await Invoice.findOne({
      quotationId: new Types.ObjectId(quotationId),
    });
    if (existing) {
      throw new RequestError(400, "An invoice already exists for this quotation");
    }

    const quotation = await Quotation.findById(quotationId);
    if (!quotation) {
      throw new NotFoundError("Quotation");
    }

    if (quotation.status !== "confirmed") {
      throw new RequestError(
        400,
        "Only confirmed quotations can be invoiced"
      );
    }

    const customer = await Customer.findById(quotation.customerId);
    if (!customer) {
      throw new NotFoundError("Customer");
    }

    const now = new Date();
    const ymd = ymdCompact(now);
    const prefix = `INV-${ymd}-`;
    const count = await Invoice.countDocuments({
      invoiceNumber: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    });
    const seq = String(count + 1).padStart(4, "0");
    const invoiceNumber = `${prefix}${seq}`;

    const items = quotation.items.map((row: IQuotationItem) => ({
      productId: row.productId,
      name: row.name,
      standardCode: row.standardCode,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lineTotal: row.lineTotal,
    }));

    const inv = await Invoice.create({
      quotationId: quotation._id,
      customerId: quotation.customerId,
      invoiceNumber,
      items,
      subtotal: quotation.subtotal,
      qrCodeData: "",
      status: "draft",
    });

    // TODO: Replace qrCodeData generation with the fiscalization service integration when the fiscalization codebase is received. The QR code must ultimately contain a digitally signed fiscal stamp.
    inv.qrCodeData = JSON.stringify({
      invoiceNumber: inv.invoiceNumber,
      customerId: String(inv.customerId),
      subtotal: inv.subtotal,
      createdAt: inv.createdAt,
    });
    await inv.save();

    quotation.status = "invoiced";
    await quotation.save();

    // Send invoice email to customer (non-blocking)
    try {
      const freshCustomer = await Customer.findById(inv.customerId).select(
        "firstName email"
      );
      if (freshCustomer?.email) {
        const itemsForEmail = inv.items.map((row: IQuotationItem) => ({
          name: row.name,
          quantity: row.quantity,
          unitPrice: parseFloat(row.unitPrice) || 0,
          lineTotal: parseFloat(row.lineTotal) || 0,
        }));
        const html = invoiceEmailTemplate({
          customerFirstName: freshCustomer.firstName,
          invoiceId: inv._id.toString(),
          invoiceNumber: inv.invoiceNumber,
          items: itemsForEmail,
          subtotal: parseFloat(inv.subtotal) || 0,
          total: parseFloat(inv.subtotal) || 0,
          siteUrl: process.env.SITE_URL ?? "",
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
          _id: inv._id.toString(),
          invoiceNumber: inv.invoiceNumber,
          quotationId: String(inv.quotationId),
          customerId: String(inv.customerId),
          items: inv.items.map((row: IQuotationItem) => ({
            productId: String(row.productId),
            name: row.name,
            standardCode: row.standardCode,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            lineTotal: row.lineTotal,
          })),
          subtotal: inv.subtotal,
          qrCodeData: inv.qrCodeData,
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
