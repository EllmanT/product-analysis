import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { patchFiscalSettings } from "@/lib/services/fiscalSettings.service";
import { getVirtualDeviceConfig } from "@/lib/services/zimraFiscal.service";

export async function POST() {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const config = await getVirtualDeviceConfig();
    const settings = await patchFiscalSettings({
      deviceId: config.deviceId || null,
      deviceSerialNumber: config.deviceSerialNumber || null,
    });

    return NextResponse.json({
      success: true,
      data: { config, settings },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync device failed";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
