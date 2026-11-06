import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { openFiscalDay } from "@/lib/services/invoice.service";

/** Body `{ "deviceKey": "<FiscalDevice id>" }` opens a branch device; omitted means the central device. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/fiscal-day");
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as { deviceKey?: unknown } | null;
    await openFiscalDay(typeof body?.deviceKey === "string" ? body.deviceKey : undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open fiscal day";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
