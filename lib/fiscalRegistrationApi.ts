import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { registerDevice, resumeRegistration, verifyTaxpayer } from "@/lib/services/fiscalDeviceRegistration.service";

const bodySchema = z.object({
  action: z.enum(["verify", "register", "resume"]),
  deviceId: z.string().trim().max(12).default(""),
  serial: z.string().trim().max(40).default(""),
  /** Used for the one ZIMRA request that needs it; never stored or logged. */
  activationKey: z.string().trim().max(32).default(""),
});

/**
 * Shared by the central and per-device register endpoints.
 *  verify   shows the taxpayer and branch ZIMRA has for this device + key (changes nothing)
 *  register registers the device and installs its first certificate
 *  resume   finishes a registration whose certificate was issued but failed its test call
 */
export async function handleRegistration(request: Request, key: string, safe: () => Promise<unknown>, permission: string): Promise<NextResponse> {
  try {
    const session = await auth();
    const denied = requirePermission(session, permission);
    if (denied) return denied;
    const actor = { id: session?.user?.id, email: session?.user?.email };

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    const { action, ...input } = parsed.data;

    if (action === "verify") {
      return NextResponse.json({ success: true, taxpayer: await verifyTaxpayer(key, input) });
    }
    if (action === "resume") {
      const r = await resumeRegistration(key, { actor });
      return NextResponse.json({ success: true, data: await safe(), registration: { newNotAfter: r.newNotAfter } });
    }
    const r = await registerDevice(key, input, { actor });
    return NextResponse.json({ success: true, data: await safe(), registration: { newNotAfter: r.newNotAfter } });
  } catch (error) {
    // Only our own, already-sanitised messages reach the client; the request body is never logged.
    return deviceError(error, "Registration failed");
  }
}
