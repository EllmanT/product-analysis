import { after, NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { openFiscalDay } from "@/lib/services/invoice.service";
import { runPosQueue } from "@/lib/services/posSale.service";

export const maxDuration = 60;

/** Body `{ "deviceKey": "<FiscalDevice id>" }` opens a branch device; omitted means the central device. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/fiscal-day");
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as { deviceKey?: unknown } | null;
    const deviceKey = typeof body?.deviceKey === "string" ? body.deviceKey : undefined;
    await openFiscalDay(deviceKey);
    // Sales made while the day was closed are waiting for it: send them now instead of waiting for the next queue
    // run, so opening the day works the same whether or not the scheduled retry job is running.
    after(async () => {
      await runPosQueue(25, { deviceKey: deviceKey || "central" }).catch(() => undefined);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open fiscal day";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
