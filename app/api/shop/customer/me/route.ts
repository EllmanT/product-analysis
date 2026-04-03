import Customer from "@/database/customer.model";
import handleError from "@/lib/handlers/error";
import { UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const customer = await Customer.findById(customerId).select(
      "firstName lastName email phone tradeName tinNumber vatNumber address"
    );

    if (!customer) {
      throw new UnauthorisedError("Please sign in");
    }

    const idStr = customer.id;

    return NextResponse.json(
      {
        success: true,
        data: {
          id: idStr,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          tradeName: customer.tradeName,
          tinNumber: customer.tinNumber,
          vatNumber: customer.vatNumber,
          address: customer.address,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
