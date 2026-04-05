import { Types } from "mongoose";
import { NextResponse } from "next/server";

import Customer from "@/database/customer.model";
import Invoice from "@/database/invoice.model";
import Quotation from "@/database/quotation.model";
import handleError from "@/lib/handlers/error";
import { UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";

export async function GET() {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const id = new Types.ObjectId(customerId);

    const [totalOrders, pendingQuotations, completedOrders, totalInvoices, customer] =
      await Promise.all([
        Quotation.countDocuments({ customerId: id }),
        Quotation.countDocuments({
          customerId: id,
          paymentStatus: "unpaid",
          status: { $in: ["pending", "confirmed"] },
        }),
        Quotation.countDocuments({ customerId: id, paymentStatus: "paid" }),
        Invoice.countDocuments({ customerId: id }),
        Customer.findById(id)
          .select("firstName lastName tradeName createdAt")
          .lean<{ firstName: string; lastName: string; tradeName: string; createdAt: Date }>(),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        totalOrders,
        pendingQuotations,
        completedOrders,
        totalInvoices,
        customer: customer
          ? {
              firstName: customer.firstName,
              lastName: customer.lastName,
              tradeName: customer.tradeName,
              memberSince: customer.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
