import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { fiscalBackend } from "@/lib/fiscal/client";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { getFiscalDeviceSafe, resolveDeviceByKey, saveDeviceIdentity } from "@/lib/services/fiscalDevice.service";
import { verifyDeviceViaService } from "@/lib/services/fiscalServiceDevices.service";
import { getVirtualDeviceConfig } from "@/lib/services/zimraFiscal.service";

/** Read this device's GetConfig and store the device ID and serial it reports. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requirePermission(await auth(), "/fiscal-devices");
    if (denied) return denied;
    const { id } = await params;
    if (!(await getFiscalDeviceSafe(id))) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    // Service back end: ZIMRA answers GetStatus for this device through the fiscal service. No Virtual Device is involved.
    if (fiscalBackend() === "service") {
      return NextResponse.json({ success: true, data: await verifyDeviceViaService(id) });
    }

    const config = await getVirtualDeviceConfig(await resolveDeviceByKey(id));
    if (!config.deviceId) {
      return NextResponse.json({ success: false, message: "The device did not report a device ID" }, { status: 422 });
    }
    await saveDeviceIdentity(id, config.deviceId, config.deviceSerialNumber);
    return NextResponse.json({ success: true, data: { config, device: await getFiscalDeviceSafe(id) } });
  } catch (error) {
    return deviceError(error, "Sync device failed");
  }
}
