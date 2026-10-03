import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { fiscalisePosSale, PosError } from "@/lib/services/posSale.service";

/** A fiscal receipt can queue behind other branches at the device; allow time for that. */
export const maxDuration = 60;

/**
 * Manual "Fiscalise" button for an unfiscalised sale.
 * Same-day sales: any user of the branch. Sales from an earlier day: admin only, because the
 * receipt is dated now and moves revenue into the current fiscal day.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const scoped = await resolvePosScope(session);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    await dbConnect();
    const existing = await PosSale.findById(id).select("branchId").lean<{ branchId: Types.ObjectId }>();
    if (!existing || (scope.branchId && String(existing.branchId) !== scope.branchId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const sale = await fiscalisePosSale(id, {
      reason: "manual",
      force: true,
      approvedBy: scope.isAdmin ? scope.userId : undefined,
    });

    if (sale.needsApproval && !scope.isAdmin) {
      return NextResponse.json(
        { success: false, code: "NEEDS_APPROVAL", message: "This sale is from an earlier day and needs an administrator to fiscalise it." },
        { status: 403 }
      );
    }
    return NextResponse.json({ success: true, data: sale.toObject() });
  } catch (error) {
    if (error instanceof PosError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to fiscalise sale";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
