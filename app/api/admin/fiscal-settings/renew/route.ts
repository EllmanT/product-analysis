import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { renewCertificate } from "@/lib/services/fiscalCertRenewal.service";
import { getFiscalSettingsSafe } from "@/lib/services/fiscalSettings.service";

/** Renew the central device's certificate now (it is also renewed automatically 30 days before expiry). */
export const maxDuration = 60;

export async function POST() {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;
    const result = await renewCertificate("central", { actor: { id: session?.user?.id, email: session?.user?.email } });
    return NextResponse.json({ success: true, data: await getFiscalSettingsSafe(), renewal: { newNotAfter: result.newNotAfter } });
  } catch (error) {
    return deviceError(error, "Renewal failed");
  }
}
