import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { getFiscalDayOverview } from "@/lib/services/fiscalDayOverview.service";

/** The fiscal day of every device at once (Fiscal day page and the Fiscal devices table). */
export async function GET() {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/fiscal-day");
    if (denied) return denied;
    return NextResponse.json({ success: true, data: await getFiscalDayOverview() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read the fiscal days";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
