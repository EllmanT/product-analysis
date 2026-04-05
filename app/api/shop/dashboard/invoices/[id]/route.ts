import { Types } from "mongoose";
import { NextResponse } from "next/server";

import Invoice from "@/database/invoice.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";

type InvoiceLean = {
  _id: Types.ObjectId;
  invoiceNumber: string;
  quotationId: Types.ObjectId;
  customerId: Types.ObjectId;
  items: Array<{
    name: string;
    standardCode: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Invoice");

    const inv = await Invoice.findOne({
      _id: new Types.ObjectId(id),
      customerId: new Types.ObjectId(customerId),
    }).lean<InvoiceLean | null>();

    if (!inv) throw new NotFoundError("Invoice");

    return NextResponse.json({
      success: true,
      data: {
        _id: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        quotationId: String(inv.quotationId),
        items: inv.items.map((row) => ({
          name: row.name,
          standardCode: row.standardCode,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal,
        })),
        subtotal: inv.subtotal,
        status: inv.status,
        createdAt: inv.createdAt,
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
