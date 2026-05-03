import { Types } from "mongoose";
import { z } from "zod";

import Customer, { type ICustomerDoc } from "@/database/customer.model";
import Quotation from "@/database/quotation.model";
import handleError from "@/lib/handlers/error";
import {
  NotFoundError,
  RequestError,
  UnauthorisedError,
  ValidationError,
} from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdForRequest } from "@/lib/shop/customer-auth";
import {
  getEmailSettingsDoc,
  resolvePublicSiteUrl,
  sanitizeNotificationEmails,
} from "@/lib/services/emailSettings.service";
import { getSellerForPublicInvoice } from "@/lib/services/invoiceSeller.service";
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
  phone: z.string().min(1).max(40),
  address: z.string().min(1).max(2000),
  tradeName: z.string().max(200).optional().default(""),
  tinNumber: z.string().max(80).optional().default(""),
  vatNumber: z.string().max(80).optional().default(""),
});

function isBusinessCustomer(c: ICustomerDoc): boolean {
  return c.buyerType === "business";
}

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
    const customerId = await getShopCustomerIdForRequest();
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
    const customerId = await getShopCustomerIdForRequest();
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

    if (isBusinessCustomer(customer)) {
      const t = body.tradeName.trim();
      const tin = body.tinNumber.trim();
      const vat = body.vatNumber.trim();
      if (!t || !tin || !vat) {
        throw new RequestError(
          400,
          "For a business account, company name, TIN, and VAT number are required on this order."
        );
      }
    }

    const tn = body.tradeName.trim();
    const tinn = body.tinNumber.trim();
    const vat = body.vatNumber.trim();
    customer.tradeName = isBusinessCustomer(customer) ? tn : "";
    customer.tinNumber = isBusinessCustomer(customer) ? tinn : "";
    customer.vatNumber = isBusinessCustomer(customer) ? vat : "";
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

    try {
      const emailDoc = await getEmailSettingsDoc();
      const siteUrl = resolvePublicSiteUrl(emailDoc);
      const seller = await getSellerForPublicInvoice();
      const itemsForEmail = created.items.map((row: { name: string; quantity: number; unitPrice: string; lineTotal: string }) => ({
        name: row.name,
        quantity: row.quantity,
        unitPrice: parseFloat(row.unitPrice) || 0,
        lineTotal: parseFloat(row.lineTotal) || 0,
      }));

      const hasTrade = typeof customer.tradeName === "string" && customer.tradeName.trim() !== "";
      const billTo = {
        displayName: hasTrade ? customer.tradeName.trim() : `${customer.firstName} ${customer.lastName}`.trim(),
        tradeName: hasTrade ? `${customer.firstName} ${customer.lastName}`.trim() : "",
        email: customer.email,
        phone: customer.phone ?? "",
        address: customer.address ?? "",
        tin:
          isBusinessCustomer(customer) && (customer.tinNumber ?? "").trim()
            ? String(customer.tinNumber).trim()
            : "",
        vat:
          isBusinessCustomer(customer) && (customer.vatNumber ?? "").trim()
            ? String(customer.vatNumber).trim()
            : "",
      };

      // Send customer confirmation email (non-blocking)
      if (emailDoc.sendCustomerQuotationEmail !== false && customer.email?.trim()) {
        try {
          const html = quotationEmailTemplate({
            customerFirstName: customer.firstName,
            quotationId: created._id.toString(),
            referenceId: refId,
            items: itemsForEmail,
            subtotal: parseFloat(created.subtotal) || 0,
            total: parseFloat(created.subtotal) || 0,
            siteUrl,
            seller,
            billTo,
          });
          await sendEmail({
            to: customer.email,
            subject: `Your Quotation #${refId} — ready to review & pay`,
            html,
          });
        } catch (emailError) {
          console.error("[Quotation Email] Failed to send customer email:", emailError);
        }
      }

      const adminRecipients = sanitizeNotificationEmails(emailDoc.adminQuotationRecipients);
      if (emailDoc.notifyAdminsNewQuotation !== false && adminRecipients.length > 0) {
        try {
          const adminHtml = adminQuotationNotificationTemplate({
            customerName: `${customer.firstName} ${customer.lastName}`,
            tradeName:
              isBusinessCustomer(customer) && (customer.tradeName ?? "").trim()
                ? (customer.tradeName ?? "N/A").trim()
                : "Personal (individual) order",
            customerEmail: customer.email,
            quotationId: created._id.toString(),
            referenceId: refId,
            itemCount: created.items.length,
            total: parseFloat(created.subtotal) || 0,
            siteUrl,
          });
          await sendEmail({
            to: adminRecipients,
            subject: `New Quotation Received — ${customer.firstName} ${customer.lastName}`,
            html: adminHtml,
          });
        } catch (adminEmailError) {
          console.error("[Quotation Email] Failed to send admin notification:", adminEmailError);
        }
      }
    } catch (notifyErr) {
      console.error("[Quotation Email] Notification setup failed:", notifyErr);
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
