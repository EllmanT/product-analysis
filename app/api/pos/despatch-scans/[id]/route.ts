import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { closeDespatchScan, DespatchScanError, getDespatchScan } from "@/lib/services/despatchScan.service";

const Body = z.object({ action: z.enum(["applied", "dismissed"]) }).strict();

const fail = (message: string, status: number) => NextResponse.json({ success: false, message }, { status });

/** Poll one scan (processing -> ready | failed). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const { id } = await context.params;
    const scan = await getDespatchScan(id, scoped.scope.branchId);
    if (!scan) return fail("Scan not found", 404);
    return NextResponse.json({ success: true, data: scan });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load the scan", 500);
  }
}

/** The cashier imported the scan into the cart ("applied") or threw it away ("dismissed"). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("Invalid request", 400);
    const { id } = await context.params;
    const data = await closeDespatchScan({
      id,
      branchId: scoped.scope.branchId,
      userId: scoped.scope.userId,
      action: body.data.action,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof DespatchScanError) return fail(error.message, error.status);
    return fail(error instanceof Error ? error.message : "Failed to update the scan", 500);
  }
}
