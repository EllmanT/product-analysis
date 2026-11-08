import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { fiscalBackend } from "@/lib/fiscal/client";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { setCentralDevice } from "@/lib/services/fiscalServiceDevices.service";

const bodySchema = z.object({ deviceId: z.string().regex(/^[a-f0-9]{24}$/).nullable() });

/** Admin: choose which device is the central one (shop invoices and branches without their own device). Service back end only. */
export async function POST(request: Request) {
  try {
    const denied = requirePermission(await auth(), "/fiscal-devices");
    if (denied) return denied;
    if (fiscalBackend() !== "service") {
      return NextResponse.json({ success: false, message: "Choosing the central device needs the fiscal service (FISCAL_BACKEND=service)." }, { status: 409 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: "Choose a device" }, { status: 400 });
    await setCentralDevice(parsed.data.deviceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return deviceError(error, "Could not change the central device");
  }
}
