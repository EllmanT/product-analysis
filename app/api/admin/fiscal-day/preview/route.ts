import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { getDayPreview } from "@/lib/services/fiscalDayPreview.service";

/** Pre-close check: the fiscal service's running counters against what the app sold (per currency). */
export async function GET(request: Request) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const deviceKey = new URL(request.url).searchParams.get("deviceKey") || undefined;
    return NextResponse.json({ success: true, data: await getDayPreview(deviceKey) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not build the preview" }, { status: 502 });
  }
}
