import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { PendingPosSalesError } from "@/lib/services/fiscalDayOps.service";
import { closeFiscalDay } from "@/lib/services/invoice.service";

/**
 * Body `{ "force": true }` closes the day even though POS sales are still unfiscalised.
 * `{ "deviceKey": "<FiscalDevice id>" }` closes a branch device; omitted means the central device.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as { force?: unknown; deviceKey?: unknown } | null;
    const report = await closeFiscalDay({
      force: body?.force === true,
      deviceKey: typeof body?.deviceKey === "string" ? body.deviceKey : undefined,
    });
    return NextResponse.json({
      success: true,
      report: {
        _id: String(report._id),
        closedAt: report.closedAt,
        fiscalDayNo: report.fiscalDayNo,
        totalSalesUsd: report.totalSalesUsd,
        totalSalesZwg: report.totalSalesZwg,
        source: report.source,
        fiscalDeviceKey: report.fiscalDeviceKey,
        deviceName: report.deviceName,
      },
    });
  } catch (error) {
    if (error instanceof PendingPosSalesError) {
      return NextResponse.json(
        { success: false, code: "POS_PENDING", pending: error.pending, message: error.message },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to close fiscal day";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
