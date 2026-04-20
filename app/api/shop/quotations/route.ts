import { Types } from "mongoose";
import { z } from "zod";

import Customer from "@/database/customer.model";
import Quotation from "@/database/quotation.model";
import handleError from "@/lib/handlers/error";
import {
  NotFoundError,
  RequestError,
  UnauthorisedError,
  ValidationError,
} from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";
import { sendEmail } from "@/lib/utils/sendEmail";
import {
  quotationEmailTemplate,
  adminQuotationNotificationTemplate,
} from "@/lib/utils/emailTemplates";
import { NextResponse } from "next/server";

const CartItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  standardCode: z.string(),
  price: z.string(),
  quantity: z.number().int().positive(),
});

const CreateQuotationSchema = z.object({
  items: z.array(CartItemSchema).min(1),
  tradeName: z.string().min(1),
  tinNumber: z.string().min(1),
  vatNumber: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
});

function lineTotal(unitPrice: string, quantity: number): string {
  const u = parseFloat(unitPrice);
  if (Number.isNaN(u)) return "0.00";
  return (u * quantity).toFixed(2);
}

function sumTotals(lines: { lineTotal: string }[]): string {
  let t = 0;
  for (const row of lines) {
    const n = parseFloat(row.lineTotal);
    if (!Number.isNaN(n)) t += n;
  }
  return t.toFixed(2);
}

export async function GET() {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const rows = await Quotation.find({ customerId })
      .sort({ createdAt: -1 })
      .select("items subtotal status paymentStatus createdAt");

    const data = rows.map((q) => ({
      id: q._id.toString(),
      createdAt: q.createdAt,
      itemCount: Array.isArray(q.items) ? q.items.length : 0,
      subtotal: q.subtotal,
      status: q.status,
      paymentStatus: q.paymentStatus,
    }));

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const json = await request.json();
    const parsed = CreateQuotationSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const body = parsed.data;
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new NotFoundError("Customer");
    }

    customer.tradeName = body.tradeName;
    customer.tinNumber = body.tinNumber;
    customer.vatNumber = body.vatNumber;
    customer.phone = body.phone;
    customer.address = body.address;
    await customer.save();

    const items = body.items.map((row) => {
      if (!Types.ObjectId.isValid(row.productId)) {
        throw new RequestError(400, "Invalid product id in cart");
      }
      const productObjectId = new Types.ObjectId(row.productId);
      const lt = lineTotal(row.price, row.quantity);
      return {
        productId: productObjectId,
        name: row.name,
        standardCode: row.standardCode,
        quantity: row.quantity,
        unitPrice: row.price,
        lineTotal: lt,
      };
    });

    const subtotal = sumTotals(items);

    const created = await Quotation.create({
      customerId: new Types.ObjectId(customerId),
      items,
      subtotal,
      status: "confirmed",
      paymentStatus: "unpaid",
    });

    const refId = created._id.toString().slice(-8).toUpperCase();
    const siteUrl = process.env.SITE_URL ?? "";

    // Send customer confirmation email (non-blocking)
    try {
      const itemsForEmail = created.items.map((row: { name: string; quantity: number; unitPrice: string; lineTotal: string }) => ({
        name: row.name,
        quantity: row.quantity,
        unitPrice: parseFloat(row.unitPrice) || 0,
        lineTotal: parseFloat(row.lineTotal) || 0,
      }));
      const html = quotationEmailTemplate({
        customerFirstName: customer.firstName,
        quotationId: created._id.toString(),
        referenceId: refId,
        items: itemsForEmail,
        subtotal: parseFloat(created.subtotal) || 0,
        total: parseFloat(created.subtotal) || 0,
        siteUrl,
      });
      await sendEmail({
        to: customer.email,
        subject: `Your Quotation #${refId} has been received — StockFlow`,
        html,
      });
    } catch (emailError) {
      console.error("[Quotation Email] Failed to send customer email:", emailError);
    }

    // Send admin notification email (non-blocking)
    try {
      const adminEmail = process.env.ADMIN_EMAIL ?? "";
      if (adminEmail) {
        const adminHtml = adminQuotationNotificationTemplate({
          customerName: `${customer.firstName} ${customer.lastName}`,
          tradeName: customer.tradeName ?? "N/A",
          customerEmail: customer.email,
          quotationId: created._id.toString(),
          referenceId: refId,
          itemCount: created.items.length,
          total: parseFloat(created.subtotal) || 0,
          siteUrl,
        });
        await sendEmail({
          to: adminEmail,
          subject: `New Quotation Received — ${customer.firstName} ${customer.lastName}`,
          html: adminHtml,
        });
      }
    } catch (adminEmailError) {
      console.error("[Quotation Email] Failed to send admin notification:", adminEmailError);
    }

    return NextResponse.json(
      {
        success: true,
        data: { _id: created._id.toString() },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
