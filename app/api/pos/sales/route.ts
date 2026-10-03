import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { createPosSale, PosError, todayInTz } from "@/lib/services/posSale.service";

const BuyerSchema = z
  .object({
    registerName: z.string().max(200).optional(),
    tradeName: z.string().max(200).optional(),
    tin: z.string().max(40).optional(),
    vatNumber: z.string().max(40).optional(),
    email: z.string().email().max(200).optional().or(z.literal("")),
    phone: z.string().max(40).optional(),
    address: z.string().max(300).optional(),
    city: z.string().max(100).optional(),
  })
  .strict();

const CreateSchema = z
  .object({
    /** Admins must say which branch; everyone else is pinned to their own. */
    branchId: z.string().optional(),
    idempotencyKey: z.string().min(16).max(80),
    currency: z.enum(["USD", "ZWG"]),
    paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
    lines: z
      .array(
        z
          .object({
            productId: z.string().optional(),
            description: z.string().min(1).max(200),
            hsCode: z.string().max(20).optional(),
            quantity: z.number().positive(),
            unitPrice: z.number().positive(),
          })
          .strict()
      )
      .min(1)
      .max(200),
    buyer: BuyerSchema.optional(),
    notes: z.string().max(300).optional(),
    /** Till clock time, only meaningful for sales synced after being made offline. */
    soldAt: z.string().datetime().optional(),
    /** Offline sync: the provisional number the till already printed, and a flag saying so. */
    provisionalNumber: z.string().regex(/^[A-Z0-9]{2,12}$/).optional(),
    offline: z.boolean().optional(),
  })
  .strict();

/** A fiscal receipt can queue behind other branches at the device; allow time for that. */
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await auth();
    const parsedBody = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "Invalid sale", issues: parsedBody.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 }
      );
    }
    const body = parsedBody.data;

    const scoped = await resolvePosScope(session, body.branchId);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (!scope.branchId) {
      return NextResponse.json({ success: false, message: "branchId is required" }, { status: 400 });
    }

    const sale = await createPosSale({
      branchId: scope.branchId,
      cashierId: scope.userId,
      idempotencyKey: body.idempotencyKey,
      currency: body.currency,
      paymentMethod: body.paymentMethod,
      lines: body.lines,
      buyer: body.buyer,
      notes: body.notes,
      soldAt: body.soldAt ? new Date(body.soldAt) : undefined,
      provisionalNumber: body.provisionalNumber,
      offline: body.offline,
    });

    return NextResponse.json({ success: true, data: sale.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof PosError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create sale";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** List sales. Branch users only ever see their own branch; admins may filter or see all. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const url = new URL(request.url);
    const scoped = await resolvePosScope(session, url.searchParams.get("branchId"));
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;

    await dbConnect();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const filter: Record<string, unknown> =
      from && to && dateRe.test(from) && dateRe.test(to) && from <= to
        ? { soldDate: { $gte: from, $lte: to } }
        : { soldDate: url.searchParams.get("date") || todayInTz() };
    if (scope.branchId) filter.branchId = new Types.ObjectId(scope.branchId);
    const status = url.searchParams.get("status");
    if (status) filter.status = { $in: status.split(",") };
    if (url.searchParams.get("needsApproval") === "1") filter.needsApproval = true;
    if (url.searchParams.get("includeTest") !== "1") filter.isTest = { $ne: true };

    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    const sales = await PosSale.find(filter)
      .select("-fiscal.rawResponse")
      .sort({ soldAt: -1 })
      .limit(limit)
      .lean();
    return NextResponse.json({ success: true, data: sales });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list sales";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
