import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { getDespatchScanImage } from "@/lib/services/despatchScan.service";

/** The slip photo, shown beside the extracted lines on the review screen. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const scoped = await resolvePosScope(await auth());
  if (!scoped.ok) return scoped.response;
  const { id } = await context.params;
  const found = await getDespatchScanImage(id, scoped.scope.branchId);
  if (!found) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(found.image), {
    headers: { "Content-Type": found.mime, "Cache-Control": "private, max-age=3600" },
  });
}
