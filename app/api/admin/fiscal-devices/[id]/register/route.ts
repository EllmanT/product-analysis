import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { handleRegistration } from "@/lib/fiscalRegistrationApi";
import { getFiscalDeviceSafe } from "@/lib/services/fiscalDevice.service";

export const maxDuration = 60;

/** Register this branch device with ZIMRA (device ID + activation key), or recover it after its certificate expired. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Check the caller before revealing whether a device id exists.
  const denied = requirePermission(await auth(), "/fiscal-devices");
  if (denied) return denied;
  const { id } = await params;
  if (!(await getFiscalDeviceSafe(id))) {
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  }
  return handleRegistration(request, id, () => getFiscalDeviceSafe(id), "/fiscal-devices");
}
