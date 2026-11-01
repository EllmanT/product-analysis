import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { createPairingToken } from "@/lib/pos/despatchPairing";
import { resolveSaleTill, TillError } from "@/lib/services/posTill.service";

const Body = z.object({ branchId: z.string().optional(), tillId: z.string().nullish() }).strict();

/** Signed-in till: get a token to show as a QR code for a phone. The phone page is /scan?t=<token>. */
export async function POST(request: Request) {
  try {
    const body = Body.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });

    const scoped = await resolvePosScope(await auth(), body.data.branchId);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (!scope.branchId) return NextResponse.json({ success: false, message: "Choose a branch" }, { status: 400 });

    const till = await resolveSaleTill(scope.branchId, body.data.tillId ?? undefined);
    const { token, expiresAt } = createPairingToken({
      branchId: scope.branchId,
      tillId: till ? String(till.tillId) : null,
      userId: scope.userId,
    });
    return NextResponse.json({
      success: true,
      data: { path: `/scan?t=${encodeURIComponent(token)}`, expiresAt: new Date(expiresAt).toISOString() },
    });
  } catch (error) {
    if (error instanceof TillError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
