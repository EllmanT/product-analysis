// TODO: Add EcoCash source IP allowlisting here for production security
import { handleWebhookNotification } from "@/lib/services/ecocash.service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let payload: Record<string, unknown> = {};

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    // EcoCash may send malformed JSON — still respond 200
    console.error("[EcoCash notify] Failed to parse request body");
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  try {
    await handleWebhookNotification(payload);
  } catch (err) {
    console.error("[EcoCash notify] Error processing notification", err);
  }

  // Always respond 200 — never return a non-200 to EcoCash
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
