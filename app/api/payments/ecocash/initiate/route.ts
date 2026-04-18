import { Types } from "mongoose";
import { z } from "zod";

import Quotation from "@/database/quotation.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, RequestError, UnauthorisedError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { initiatePayment } from "@/lib/services/ecocash.service";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";
import { NextResponse } from "next/server";

const InitiateSchema = z.object({
  quotationId: z.string().min(1),
  phoneNumber: z.string().min(1).max(20),
  currency: z.enum(["USD", "ZWG"]),
});

export async function POST(request: Request) {
  try {
    await dbConnect();

    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) throw new UnauthorisedError("Please sign in");

    const json = await request.json();
    const parsed = InitiateSchema.safeParse(json);
    if (!parsed.success) {
      throw new RequestError(400, "Invalid request body");
    }

    const { quotationId, phoneNumber, currency } = parsed.data;

    if (!Types.ObjectId.isValid(quotationId)) {
      throw new NotFoundError("Quotation");
    }

    const quotation = await Quotation.findOne({
      _id: new Types.ObjectId(quotationId),
      customerId: new Types.ObjectId(customerId),
    });

    if (!quotation) throw new NotFoundError("Quotation");

    if (quotation.status !== "confirmed") {
      throw new RequestError(400, "Only confirmed quotations can be paid");
    }

    if (quotation.paymentStatus === "paid") {
      throw new RequestError(400, "This quotation has already been paid");
    }

    const usdAmount = parseFloat(quotation.subtotal);
    if (Number.isNaN(usdAmount) || usdAmount <= 0) {
      throw new RequestError(400, "Invalid quotation amount");
    }

    const result = await initiatePayment({
      quotationId,
      customerId,
      phoneNumber,
      currency,
      usdAmount,
    });

    return NextResponse.json(
      {
        success: true,
        message: "EcoCash payment initiated. Please approve the request on your phone.",
        referenceCode: result.referenceCode,
        clientCorrelator: result.clientCorrelator,
        localAmount: result.localAmount,
        localCurrency: result.localCurrency,
        ecocashStatus: result.status,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
