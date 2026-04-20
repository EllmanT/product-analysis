import { Types } from "mongoose";
import { NextResponse } from "next/server";

import Quotation from "@/database/quotation.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { NotFoundError, RequestError } from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { issueFiscalInvoiceForPaidQuotation } from "@/lib/services/postPaymentInvoice.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();
    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Quotation");
    }

    const q = await Quotation.findById(id);
    if (!q) {
      throw new NotFoundError("Quotation");
    }

    if (q.checkoutPaymentMethod !== "cod") {
      throw new RequestError(400, "Delivery confirmation applies to cash-on-delivery quotations only");
    }
    if (q.fulfillmentStatus !== "pending") {
      throw new RequestError(400, "Delivery is not pending for this quotation");
    }
    if (q.paymentStatus === "paid") {
      throw new RequestError(400, "This quotation is already marked as paid");
    }

    q.fulfillmentStatus = "delivered";
    q.paymentStatus = "paid";
    q.paidAt = new Date();
    q.paymentReference = "COD:delivered";
    await q.save();

    await issueFiscalInvoiceForPaidQuotation(q._id.toString(), "CASH");

    return NextResponse.json({
      success: true,
      data: {
        _id: q._id.toString(),
        fulfillmentStatus: q.fulfillmentStatus,
        paymentStatus: q.paymentStatus,
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
