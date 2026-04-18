import { z } from "zod";

import ExchangeRate from "@/database/exchangeRate.model";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

const CreateRateSchema = z.object({
  currency: z.string().min(1).max(10).toUpperCase(),
  rate: z.number().positive(),
  effectiveDate: z.string().min(1),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const currency = searchParams.get("currency");

    const filter = currency ? { currency: currency.toUpperCase() } : {};

    const rates = await ExchangeRate.find(filter)
      .sort({ currency: 1, effectiveDate: -1 })
      .lean();

    return NextResponse.json({ success: true, data: rates }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();

    const json = await request.json();
    const parsed = CreateRateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: "Validation error", details: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const { currency, rate, effectiveDate, notes } = parsed.data;

    const record = await ExchangeRate.create({
      currency,
      rate,
      effectiveDate: new Date(effectiveDate),
      notes,
    });

    return NextResponse.json(
      { success: true, data: record },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
