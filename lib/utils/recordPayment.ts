import { Types } from "mongoose";

import Quotation from "@/database/quotation.model";
import dbConnect from "@/lib/mongoose";

interface RecordPaymentInput {
  quotationId: string;
  usdAmount: number;
  method: string;
  reference: string;
}

export async function recordPayment({
  quotationId,
  usdAmount,
  method,
  reference,
}: RecordPaymentInput): Promise<void> {
  await dbConnect();

  if (!Types.ObjectId.isValid(quotationId)) {
    throw new Error(`Invalid quotation id: ${quotationId}`);
  }

  const quotation = await Quotation.findById(quotationId);
  if (!quotation) {
    throw new Error(`Quotation ${quotationId} not found`);
  }

  quotation.paymentStatus = "paid";
  quotation.paidAt = new Date();
  quotation.paymentReference = `${method.toUpperCase()}:${reference}`;

  await quotation.save();

  console.log(
    `[recordPayment] Quotation ${quotationId} marked paid — method=${method} ref=${reference} amount=${usdAmount.toFixed(2)} USD`
  );
}
