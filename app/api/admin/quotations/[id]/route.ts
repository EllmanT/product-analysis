import { Types } from "mongoose";

import Customer from "@/database/customer.model";
import Quotation, { type IQuotationItem } from "@/database/quotation.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { NotFoundError } from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

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
      throw new NotFoundError("Quotation");
    }

    const q = await Quotation.findById(id);
    if (!q) {
      throw new NotFoundError("Quotation");
    }

    const customer = await Customer.findById(q.customerId).select(
      "firstName lastName tradeName email phone tinNumber vatNumber address"
    );

    const itemsPlain = q.items.map((row: IQuotationItem) => ({
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
          quotation: {
            _id: q._id.toString(),
            items: itemsPlain,
            subtotal: q.subtotal,
            status: q.status,
            paymentStatus: q.paymentStatus,
            createdAt: q.createdAt,
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
