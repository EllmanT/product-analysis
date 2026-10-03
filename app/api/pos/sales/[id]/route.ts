import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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
    const sale = await PosSale.findById(id).select("-fiscal.rawResponse").lean<{ branchId: Types.ObjectId }>();
    // A sale outside the caller's branch looks exactly like one that does not exist.
    if (!sale || (scope.branchId && String(sale.branchId) !== scope.branchId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: sale });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sale";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
