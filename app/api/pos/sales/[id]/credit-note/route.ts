import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { issueCreditNote, PosError } from "@/lib/services/posSale.service";

const Body = z.object({ reason: z.string().trim().max(200).optional() }).strict();

/** A fiscal receipt can queue behind other branches at the device; allow time for that. */
export const maxDuration = 60;

/**
 * Issue a fiscal credit note reversing a fiscalised sale in full.
 * Supervisors only: branch users for their own branch, administrators for any branch. Cashiers cannot.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (scope.role === "cashier") {
      return NextResponse.json({ success: false, message: "Only a supervisor can issue a credit note" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const body = Body.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });

    await dbConnect();
    const existing = await PosSale.findById(id).select("branchId").lean<{ branchId: Types.ObjectId }>();
    if (!existing || (scope.branchId && String(existing.branchId) !== scope.branchId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const cn = await issueCreditNote(id, scope.userId, body.data.reason);
    if (cn.status === "FAILED") {
      return NextResponse.json(
        { success: false, code: "DEVICE_REFUSED", message: cn.lastError ?? "The fiscal device refused the credit note" },
        { status: 422 }
      );
    }
    return NextResponse.json({ success: true, data: cn.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof PosError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to issue credit note";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
