import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { getFiscalDayStatus } from "@/lib/services/invoice.service";

export async function GET(_request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const status = await getFiscalDayStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get fiscal day status";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
