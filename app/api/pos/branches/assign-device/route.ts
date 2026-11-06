import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { requirePermission } from "@/lib/auth/role";
import { assignBranchDevice, DeviceConfigError } from "@/lib/services/fiscalDevice.service";

const Body = z
  .object({
    /** FiscalDevice id, or null for the central device. */
    fiscalDeviceId: z.string().regex(/^[a-f0-9]{24}$/, "Invalid device").nullable(),
    branchIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(500),
  })
  .strict();

/**
 * Admin only: put several branches on the same fiscal device in one go (for example every branch back on
 * the central device). Sales already numbered keep the device they were made on; only new sales move.
 */
export async function POST(request: Request) {
  try {
    const denied = requirePermission(await auth(), "/pos-settings");
    if (denied) return denied;
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    const { fiscalDeviceId, branchIds } = parsed.data;
    // A non-admin may only move their own branch.
    for (const id of branchIds) {
      const scoped = await resolvePosScope(await auth(), id);
      if (!scoped.ok) return scoped.response;
    }
    for (const id of branchIds) await assignBranchDevice(id, fiscalDeviceId);
    return NextResponse.json({ success: true, data: { updated: branchIds.length } });
  } catch (error) {
    if (error instanceof DeviceConfigError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Failed to assign devices";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
