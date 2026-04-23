import { Types } from "mongoose";
import { z } from "zod";

import Customer from "@/database/customer.model";
import Invoice, { type IInvoiceItem } from "@/database/invoice.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { NotFoundError, RequestError, ValidationError } from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { getSellerForAdminSession } from "@/lib/services/invoiceSeller.service";
import { NextResponse } from "next/server";

const PatchSchema = z.object({
  status: z.enum(["sent", "draft"]).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Invoice");

    const inv = await Invoice.findById(id);
    if (!inv) throw new NotFoundError("Invoice");

    const customer = await Customer.findById(inv.customerId).select(
      "firstName lastName tradeName email phone tinNumber vatNumber address"
    );

    const seller = await getSellerForAdminSession(session);

    const itemsPlain = inv.items.map((row: IInvoiceItem) => ({
      productId: String(row.productId),
      name: row.name,
      standardCode: row.standardCode,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lineTotal: row.lineTotal,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          invoice: {
            _id: String(inv._id),
            invoiceNumber: inv.invoiceNumber,
            quotationId: String(inv.quotationId),
            items: itemsPlain,
            subtotal: inv.subtotal,
            qrCodeData: inv.qrCodeData,
            status: inv.status,
            createdAt: inv.createdAt,

            // Fiscalization fields
            receiptType: inv.receiptType,
            receiptCurrency: inv.receiptCurrency,
            receiptDate: inv.receiptDate,
            receiptPrintForm: inv.receiptPrintForm,
            paymentMethod: inv.paymentMethod,
            taxInclusive: inv.taxInclusive,
            subtotalExclTax: inv.subtotalExclTax,
            totalVat: inv.totalVat,
            totalAmount: inv.totalAmount,
            fiscalStatus: inv.fiscalStatus,
            fiscalSubmittedAt: inv.fiscalSubmittedAt,
            isFiscalized: inv.isFiscalized,
            receiptNotes: inv.receiptNotes,
            fiscalData: inv.fiscalData,
            lines: inv.lines,
            buyerSnapshot: inv.buyerSnapshot,
          },
          customer: customer
            ? {
                firstName: customer.firstName,
                lastName: customer.lastName,
                tradeName: customer.tradeName,
                email: customer.email,
                phone: customer.phone,
                tinNumber: customer.tinNumber,
                vatNumber: customer.vatNumber,
                address: customer.address,
              }
            : null,
          seller,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Invoice");

    const json = await request.json();
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const inv = await Invoice.findById(id);
    if (!inv) throw new NotFoundError("Invoice");

    if (parsed.data.status) {
      if (inv.isFiscalized && parsed.data.status === "draft") {
        throw new RequestError(400, "Cannot move a fiscalized invoice back to draft");
      }
      inv.status = parsed.data.status;
      await inv.save();
    }

    return NextResponse.json({ success: true, data: { _id: String(inv._id), status: inv.status } }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
