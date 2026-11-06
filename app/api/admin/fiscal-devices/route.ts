import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { deviceError, deviceSchema } from "@/lib/fiscalDeviceApi";
import { isEncryptionConfigured } from "@/lib/security/secretBox";
import { createFiscalDevice, listFiscalDevices } from "@/lib/services/fiscalDevice.service";

/** Admin: branch fiscal devices (the central device stays under Fiscal settings). */
export async function GET() {
  try {
    const denied = requirePermission(await auth(), "/fiscal-devices");
    if (denied) return denied;
    return NextResponse.json({
      success: true,
      data: await listFiscalDevices(),
      // Without the master key a certificate or login password cannot be saved.
      meta: { encryptionConfigured: isEncryptionConfigured() },
    });
  } catch (error) {
    return deviceError(error, "Failed to load devices");
  }
}

export async function POST(request: Request) {
  try {
    const denied = requirePermission(await auth(), "/fiscal-devices");
    if (denied) return denied;
    const parsed = deviceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid device" }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await createFiscalDevice(parsed.data) }, { status: 201 });
  } catch (error) {
    return deviceError(error, "Failed to create device");
  }
}
