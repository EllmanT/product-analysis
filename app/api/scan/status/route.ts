import { NextResponse } from "next/server";

import { checkPairing } from "@/lib/pos/despatchPairingAccess";
import { getDespatchScan } from "@/lib/services/despatchScan.service";

/** Public, token-gated: just enough for the phone to say "sent to the till". No prices, no customer data. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const paired = await checkPairing(url.searchParams.get("t"));
  if (!paired.ok) return NextResponse.json({ success: false, message: paired.message }, { status: paired.status });

  const scan = await getDespatchScan(url.searchParams.get("id") ?? "", paired.claims.branchId);
  if (!scan) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: {
      status: scan.status,
      slipNumber: scan.slipNumber,
      lineCount: scan.lines.length,
      error: scan.status === "failed" ? scan.processingError : null,
    },
  });
}
