import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runCertExpiryCheck } from "@/lib/services/fiscalCertExpiry.service";
import { runAutoRenewals } from "@/lib/services/fiscalCertRenewal.service";

/** A renewal generates a key and makes two calls to ZIMRA per device. */
export const maxDuration = 60;

/**
 * Daily: renews device certificates with 30 days or fewer left, then checks every certificate and
 * emails the administrators as expiry approaches.
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, message: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    // Renew first, so a certificate renewed today is not reported as about to expire.
    const renewals = await runAutoRenewals();
    return NextResponse.json({ success: true, renewals, devices: await runCertExpiryCheck() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron failed";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
