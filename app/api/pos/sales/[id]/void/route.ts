import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { PosError, voidPosSale } from "@/lib/services/posSale.service";

/** Admin only. Cancels a sale that was never fiscalised (checks the device first). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "pos.void");
    if (denied) return denied;

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const sale = await voidPosSale(id);
    return NextResponse.json({ success: true, data: sale.toObject() });
  } catch (error) {
    if (error instanceof PosError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to void sale";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
