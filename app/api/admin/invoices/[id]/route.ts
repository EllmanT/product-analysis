import { Types } from "mongoose";
import { z } from "zod";

import Customer from "@/database/customer.model";
import Invoice, { type IInvoiceItem } from "@/database/invoice.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import {
  NotFoundError,
  RequestError,
  ValidationError,
} from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

const PatchSchema = z.object({
  status: z.literal("sent"),
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
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Invoice");
    }

    const inv = await Invoice.findById(id);
    if (!inv) {
      throw new NotFoundError("Invoice");
    }

    const customer = await Customer.findById(inv.customerId).select(
      "firstName lastName tradeName email phone tinNumber vatNumber address"
    );

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
            _id: inv._id.toString(),
            invoiceNumber: inv.invoiceNumber,
            quotationId: String(inv.quotationId),
            items: itemsPlain,
            subtotal: inv.subtotal,
            qrCodeData: inv.qrCodeData,
            status: inv.status,
            createdAt: inv.createdAt,
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
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Invoice");
    }

    const json = await request.json();
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const inv = await Invoice.findById(id);
    if (!inv) {
      throw new NotFoundError("Invoice");
    }

    if (inv.status !== "draft") {
      throw new RequestError(400, "Only draft invoices can be marked as sent");
    }

    inv.status = "sent";
    await inv.save();

    return NextResponse.json(
      {
        success: true,
        data: {
          _id: inv._id.toString(),
          status: inv.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
