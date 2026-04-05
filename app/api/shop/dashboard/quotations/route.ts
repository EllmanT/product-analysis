import { Types } from "mongoose";
import { NextResponse } from "next/server";

import Quotation from "@/database/quotation.model";
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
    const filter = searchParams.get("filter") ?? "all";

    const id = new Types.ObjectId(customerId);
    const query: Record<string, unknown> = { customerId: id };

    if (filter === "pending") {
      query.paymentStatus = "unpaid";
      query.status = { $in: ["pending", "confirmed"] };
    } else if (filter === "completed") {
      query.paymentStatus = "paid";
    }

    const [total, rows] = await Promise.all([
      Quotation.countDocuments(query),
      Quotation.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const quotations = rows.map((q) => ({
      _id: String(q._id),
      referenceId: String(q._id).slice(-8).toUpperCase(),
      createdAt: q.createdAt,
      items: Array.isArray(q.items) ? q.items : [],
      total: q.subtotal,
      status: q.status,
      paymentStatus: q.paymentStatus,
    }));

    return NextResponse.json({
      success: true,
      data: {
        quotations,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
