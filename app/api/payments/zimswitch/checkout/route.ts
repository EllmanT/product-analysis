import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import ZimswitchCheckout from "@/database/zimswitchCheckout.model";
import Quotation from "@/database/quotation.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, RequestError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { isValidPaymentOption, ZIMSWITCH_PAYMENT_OPTIONS } from "@/lib/config/zimswitchOptions";
import { createCheckout } from "@/lib/services/zimswitch.service";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";

const CheckoutSchema = z.object({
  quotationId: z.string().min(1),
  paymentOption: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await dbConnect();

    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const json = await request.json();
    const parsed = CheckoutSchema.safeParse(json);
    if (!parsed.success) throw new RequestError(400, "Invalid request body");

    const { quotationId, paymentOption } = parsed.data;

    if (!isValidPaymentOption(paymentOption)) {
      throw new RequestError(400, "Invalid payment option");
    }

    if (!Types.ObjectId.isValid(quotationId)) throw new NotFoundError("Quotation");

    const quotation = await Quotation.findOne({
      _id: new Types.ObjectId(quotationId),
      customerId: new Types.ObjectId(customerId),
    });

    if (!quotation) throw new NotFoundError("Quotation");
    if (!["pending", "confirmed"].includes(quotation.status)) {
      throw new RequestError(400, "This quotation cannot be paid");
    }
    if (quotation.paymentStatus === "paid") {
      throw new RequestError(400, "This quotation has already been paid");
    }

    const amount = parseFloat(quotation.subtotal);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new RequestError(400, "Invalid quotation amount");
    }

    const option = ZIMSWITCH_PAYMENT_OPTIONS[paymentOption];
    const paymentType = process.env.ZIMSWITCH_PAYMENT_TYPE ?? "DB";
    const baseUrl = (process.env.ZIMSWITCH_BASE_URL ?? "https://eu-prod.oppwa.com").replace(/\/$/, "");

    const result = await createCheckout({
      amount,
      currency: option.currency,
      entityId: option.entityId,
      paymentType,
    });

    await ZimswitchCheckout.create({
      checkoutId: result.id,
      quotationId: new Types.ObjectId(quotationId),
      customerId: new Types.ObjectId(customerId),
      entityId: option.entityId,
      paymentOption,
      amount,
      currency: option.currency,
      status: "pending",
    });

    return NextResponse.json({
      success: true,
      checkoutId: result.id,
      entityId: option.entityId,
      dataBrands: option.dataBrands,
      baseUrl,
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
