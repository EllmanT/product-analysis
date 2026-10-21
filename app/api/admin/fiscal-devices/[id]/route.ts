import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { deviceError, deviceSchema } from "@/lib/fiscalDeviceApi";
import { deleteFiscalDevice, getFiscalDeviceSafe, updateFiscalDevice } from "@/lib/services/fiscalDevice.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const device = await getFiscalDeviceSafe((await params).id);
    if (!device) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: device });
  } catch (error) {
    return deviceError(error, "Failed to load device");
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const parsed = deviceSchema.partial().safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid device" }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await updateFiscalDevice((await params).id, parsed.data) });
  } catch (error) {
    return deviceError(error, "Failed to update device");
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    await deleteFiscalDevice((await params).id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return deviceError(error, "Failed to delete device");
  }
}
