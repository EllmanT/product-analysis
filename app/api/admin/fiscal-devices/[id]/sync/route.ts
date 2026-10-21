import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { getFiscalDeviceSafe, resolveDeviceByKey, saveDeviceIdentity } from "@/lib/services/fiscalDevice.service";
import { getVirtualDeviceConfig } from "@/lib/services/zimraFiscal.service";

/** Read this device's GetConfig and store the device ID and serial it reports. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const { id } = await params;
    if (!(await getFiscalDeviceSafe(id))) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
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
