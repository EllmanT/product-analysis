import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import Branch from "@/database/branch.model";
import PosSale from "@/database/posSale.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { DeviceConfigError, resolveDeviceByKey, resolveDeviceForBranch } from "@/lib/services/fiscalDevice.service";
import { fiscalBackend } from "@/lib/fiscal/client";
import { getServiceDeviceHealth } from "@/lib/services/fiscalServiceStatus.service";
import { deviceKeyForBranch } from "@/lib/services/fiscalDevice.service";
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
    // The till shows its own branch's device. An admin looking across branches sees the central one.
    const deviceStatus = async () => {
      try {
        if (fiscalBackend() === "service") {
          // The branch's own device, or the central one. ZIMRA is asked through the fiscal service, not a Virtual Device.
          const key = scope.branchId ? deviceKeyForBranch(await Branch.findById(scope.branchId).select("pos.fiscalDeviceId").lean<{ pos?: { fiscalDeviceId?: string | null } }>()) : undefined;
          const h = await getServiceDeviceHealth(key);
          return { ...h, lastReceiptGlobalNo: null };
        }
        const d = scope.branchId ? await resolveDeviceForBranch(scope.branchId) : await resolveDeviceByKey();
        return await getPosDeviceStatus(d);
      } catch (e) {
        if (!(e instanceof DeviceConfigError)) throw e;
        return { reachable: false, dayOpen: null, fiscalDayNo: null, lastReceiptGlobalNo: null, message: e.message };
      }
    };
    const [totals, device, unfiscalised] = await Promise.all([
      getPosSummary({ branchId: scope.branchId ?? undefined, date: url.searchParams.get("date") ?? undefined }),
      deviceStatus(),
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
