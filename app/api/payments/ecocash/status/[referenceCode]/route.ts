import handleError from "@/lib/handlers/error";
import { NotFoundError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getTransaction } from "@/lib/services/ecocash.service";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ referenceCode: string }> }
) {
  try {
    await dbConnect();

    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const { referenceCode } = await context.params;

    const txn = await getTransaction(referenceCode);
    if (!txn) throw new NotFoundError("Transaction");

    // Verify the transaction belongs to this customer
    if (txn.customerId.toString() !== customerId) {
      throw new NotFoundError("Transaction");
    }

    return NextResponse.json(
      {
        success: true,
        status: txn.status,
        completedAt: txn.completedAt ?? null,
        localAmount: txn.localAmount,
        localCurrency: txn.localCurrency,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
