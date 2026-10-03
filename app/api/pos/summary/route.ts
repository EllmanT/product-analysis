import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { getPosSummary } from "@/lib/services/posSale.service";
import { getPosDeviceStatus } from "@/lib/services/zimraPosDevice.service";

/**
 * Totals strip for the POS screen: today's fiscalised and pending totals per currency for
 * the caller's branch (admins: all branches, or `?branchId=`), plus device/day status and the
 * count of sales waiting to be fiscalised.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const url = new URL(request.url);
    const scoped = await resolvePosScope(session, url.searchParams.get("branchId"));
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;

    await dbConnect();
    const [totals, device, unfiscalised] = await Promise.all([
      getPosSummary({ branchId: scope.branchId ?? undefined, date: url.searchParams.get("date") ?? undefined }),
      getPosDeviceStatus(),
      PosSale.countDocuments({
        status: { $in: ["UNFISCALISED", "UNKNOWN"] },
        isTest: { $ne: true },
        ...(scope.branchId ? { branchId: new Types.ObjectId(scope.branchId) } : {}),
      }),
    ]);
    return NextResponse.json({ success: true, data: { totals, device, unfiscalised } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load summary";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
