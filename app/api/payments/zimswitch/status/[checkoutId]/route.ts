import { NextResponse } from "next/server";

import ZimswitchCheckout from "@/database/zimswitchCheckout.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { fetchPaymentStatus } from "@/lib/services/zimswitch.service";
import { recordPayment } from "@/lib/utils/recordPayment";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ checkoutId: string }> }
) {
  try {
    await dbConnect();

    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const { checkoutId } = await context.params;
    const checkout = await ZimswitchCheckout.findOne({ checkoutId });
    if (!checkout) throw new NotFoundError("Checkout");

    if (checkout.status !== "pending") {
      return NextResponse.json({
        success: true,
        status: checkout.status,
        resultCode: null,
        description: checkout.status === "completed" ? "Payment already recorded" : "Payment failed",
      });
    }

    const result = await fetchPaymentStatus({
      checkoutId,
      entityId: checkout.entityId,
    });

    if (result.paymentStatus === "success") {
      await recordPayment({
        quotationId: checkout.quotationId.toString(),
        usdAmount: checkout.currency === "USD" ? checkout.amount : 0,
        method: "zimswitch",
        reference: checkoutId,
      });
      checkout.status = "completed";
      await checkout.save();
    } else if (result.paymentStatus === "failed") {
      checkout.status = "failed";
      await checkout.save();
    }

    return NextResponse.json({
      success: true,
      status: result.paymentStatus,
      resultCode: result.resultCode,
      description: result.description,
      category: result.category,
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
