import { NextResponse } from "next/server";

import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { requireAdmin } from "@/lib/auth/role";
import { fiscalizeInvoice } from "@/lib/services/invoice.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const { id } = await context.params;
    const invoice = await fiscalizeInvoice(id);

    return NextResponse.json(
      {
        success: true,
        message: "Invoice fiscalized successfully",
        data: {
          _id: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          isFiscalized: invoice.isFiscalized,
          fiscalStatus: invoice.fiscalStatus,
          fiscalSubmittedAt: invoice.fiscalSubmittedAt,
          fiscalData: invoice.fiscalData,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error) {
      const status =
        error.message.includes("already fiscalized") ? 422
        : error.message.includes("not found") ? 404
        : error.message.includes("closed") ? 422
        : 500;

      return NextResponse.json(
        { success: false, message: error.message },
        { status }
      );
    }
    return handleError(error, "api") as APIErrorResponse;
  }
}
