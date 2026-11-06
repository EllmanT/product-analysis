import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { acknowledgeAlert, fiscalBackend, listAlerts } from "@/lib/fiscal/client";

/** Open alerts recorded by the fiscal service. Empty (not an error) when the legacy backend is in use. */
export async function GET() {
  try {
    const denied = requirePermission(await auth(), "/fiscal-day");
    if (denied) return denied;
    if (fiscalBackend() !== "service") return NextResponse.json({ success: true, data: [], backend: "legacy" });
    return NextResponse.json({ success: true, data: await listAlerts(true), backend: "service" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not read alerts" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/fiscal-day");
    if (denied) return denied;
    const parsed = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid alert id" }, { status: 400 });
    const ok = await acknowledgeAlert(parsed.data.id, session?.user?.email ?? "admin");
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, message: "That alert is already acknowledged" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not acknowledge" }, { status: 502 });
  }
}
