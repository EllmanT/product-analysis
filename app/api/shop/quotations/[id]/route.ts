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
import { NextResponse } from "next/server";

const PatchSchema = z.object({
  action: z.literal("confirm"),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Quotation");
    }

    const q = await Quotation.findOne({
      _id: new Types.ObjectId(id),
      customerId: new Types.ObjectId(customerId),
    });

    if (!q) {
      throw new NotFoundError("Quotation");
    }

    const customer = await Customer.findById(customerId).select(
      "tradeName tinNumber vatNumber phone address email firstName lastName"
    );

    const itemsPlain = q.items.map((row: (typeof q.items)[number]) => ({
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
                tradeName: customer.tradeName,
                tinNumber: customer.tinNumber,
                vatNumber: customer.vatNumber,
                phone: customer.phone,
                address: customer.address,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
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
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Quotation");
    }

    const json = await request.json();
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const doc = await Quotation.findOne({
      _id: new Types.ObjectId(id),
      customerId: new Types.ObjectId(customerId),
    });

    if (!doc) {
      throw new NotFoundError("Quotation");
    }

    if (doc.status !== "pending") {
      throw new RequestError(
        400,
        "Only pending quotations can be confirmed"
      );
    }

    doc.status = "confirmed";
    await doc.save();

    return NextResponse.json(
      {
        success: true,
        data: {
          _id: doc._id.toString(),
          status: doc.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
