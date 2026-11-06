import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { clearSaleReview, PosError } from "@/lib/services/posSale.service";

/** Admin only. Marks a receipt the fiscal device refused as reviewed, so the scheduled close can run. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "pos.void");
    if (denied) return denied;

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const sale = await clearSaleReview(id);
    return NextResponse.json({ success: true, data: sale.toObject() });
  } catch (error) {
    if (error instanceof PosError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to clear review";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
