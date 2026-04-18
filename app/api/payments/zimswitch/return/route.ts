import { NextRequest, NextResponse } from "next/server";

import ZimswitchCheckout from "@/database/zimswitchCheckout.model";
import dbConnect from "@/lib/mongoose";
import { fetchPaymentStatus } from "@/lib/services/zimswitch.service";
import { recordPayment } from "@/lib/utils/recordPayment";

// No auth — OPPWA redirects the browser here after payment
export async function GET(request: NextRequest) {
  await dbConnect();

  const { searchParams } = request.nextUrl;
  const checkoutId = searchParams.get("id");
  const quotationId = searchParams.get("quotationId");

  if (!checkoutId) {
    return NextResponse.redirect(new URL("/payment/failed", request.url));
  }

  const checkout = await ZimswitchCheckout.findOne({ checkoutId });
  if (!checkout) {
    const fallbackQid = quotationId ?? "";
    return NextResponse.redirect(
      new URL(`/payment/failed?quotationId=${fallbackQid}`, request.url)
    );
  }

  const resolvedQuotationId =
    quotationId ?? checkout.quotationId.toString();

  if (checkout.status === "completed") {
    return NextResponse.redirect(
      new URL(`/payment/success?quotationId=${resolvedQuotationId}`, request.url)
    );
  }

  if (checkout.status === "failed") {
    return NextResponse.redirect(
      new URL(`/payment/failed?quotationId=${resolvedQuotationId}`, request.url)
    );
  }

  const result = await fetchPaymentStatus({
    checkoutId,
    entityId: checkout.entityId,
  });

  if (result.paymentStatus === "success") {
    try {
      await recordPayment({
        quotationId: checkout.quotationId.toString(),
        usdAmount: checkout.currency === "USD" ? checkout.amount : 0,
        method: "zimswitch",
        reference: checkoutId,
      });
    } catch (err) {
      console.error("[ZimSwitch] return: recordPayment failed", err);
    }
    checkout.status = "completed";
    await checkout.save();
    return NextResponse.redirect(
      new URL(`/payment/success?quotationId=${resolvedQuotationId}`, request.url)
    );
  }

  if (result.paymentStatus === "failed") {
    checkout.status = "failed";
    await checkout.save();
  }

  return NextResponse.redirect(
    new URL(`/payment/failed?quotationId=${resolvedQuotationId}`, request.url)
  );
}
