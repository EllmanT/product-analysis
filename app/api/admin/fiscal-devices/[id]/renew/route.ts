import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { renewCertificate } from "@/lib/services/fiscalCertRenewal.service";
import { getFiscalDeviceSafe } from "@/lib/services/fiscalDevice.service";

/** Renew this device's certificate now (it is also renewed automatically 30 days before expiry). */
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;
    const { id } = await params;
    if (!(await getFiscalDeviceSafe(id))) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const result = await renewCertificate(id, { actor: { id: session?.user?.id, email: session?.user?.email } });
    return NextResponse.json({ success: true, data: await getFiscalDeviceSafe(id), renewal: { newNotAfter: result.newNotAfter } });
  } catch (error) {
    return deviceError(error, "Renewal failed");
  }
}
