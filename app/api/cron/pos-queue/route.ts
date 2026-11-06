import { NextResponse } from "next/server";

import { pullServiceAlerts } from "@/lib/fiscal/serviceAlerts.service";
import { runFiscalQueues } from "@/lib/fiscal/issue";

/** A fiscal receipt can queue behind other branches at the device; allow time for that. */
export const maxDuration = 60;

/**
 * Retries unfiscalised POS sales and shop invoices that are waiting for ZIMRA (whatever day they were sold),
 * and reconciles sales whose outcome is unknown. Call every minute from an external scheduler with header:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, message: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pos, shop } = await runFiscalQueues();
    const alerts = await pullServiceAlerts();
    return NextResponse.json({ success: true, ...pos, shop, alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "POS queue failed";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
