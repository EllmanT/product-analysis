import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { resolveDeviceByKey } from "@/lib/services/fiscalDevice.service";
import { getFiscalDayStatus } from "@/lib/services/invoice.service";
import { getDeviceHealth } from "@/lib/services/zimraPosDevice.service";

/** `?deviceKey=<FiscalDevice id>` selects a branch device; omitted means the central device. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const deviceKey = new URL(request.url).searchParams.get("deviceKey") || undefined;
    const target = await resolveDeviceByKey(deviceKey);
    const [status, device] = await Promise.all([getFiscalDayStatus(deviceKey), getDeviceHealth(target)]);
    return NextResponse.json({ success: true, ...status, device, deviceKey: target.key, deviceName: target.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get fiscal day status";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
