import { Types } from "mongoose";
import { NextResponse } from "next/server";

import Invoice from "@/database/invoice.model";
import handleError from "@/lib/handlers/error";
import { UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";

export async function GET(request: Request) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));

    const id = new Types.ObjectId(customerId);

    const [total, rows] = await Promise.all([
      Invoice.countDocuments({ customerId: id }),
      Invoice.find({ customerId: id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const invoices = rows.map((inv) => ({
      _id: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      createdAt: inv.createdAt,
      total: inv.subtotal,
      status: inv.status,
    }));

    return NextResponse.json({
      success: true,
      data: {
        invoices,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
