import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { fiscalBackend } from "@/lib/fiscal/client";
import { getServiceDayState } from "@/lib/services/fiscalServiceStatus.service";
import { resolveDeviceByKey } from "@/lib/services/fiscalDevice.service";
import { getFiscalDayStatus } from "@/lib/services/invoice.service";
import { getDeviceHealth } from "@/lib/services/zimraPosDevice.service";

/** `?deviceKey=<FiscalDevice id>` selects a branch device; omitted means the central device. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/fiscal-day");
    if (denied) return denied;

    const deviceKey = new URL(request.url).searchParams.get("deviceKey") || undefined;
    if (fiscalBackend() === "service") {
      return NextResponse.json({ success: true, ...(await getServiceDayState(deviceKey)) });
    }
    const target = await resolveDeviceByKey(deviceKey);
    const [status, device] = await Promise.all([getFiscalDayStatus(deviceKey), getDeviceHealth(target)]);
    return NextResponse.json({ success: true, ...status, device, deviceKey: target.key, deviceName: target.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get fiscal day status";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
