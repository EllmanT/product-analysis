import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { listPosBranches } from "@/lib/services/posBranch.service";

/** Branches with their POS settings: admin sees all, everyone else only their own. */
export async function GET() {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const data = await listPosBranches(scoped.scope.branchId);
    return NextResponse.json({ success: true, data, meta: { isAdmin: scoped.scope.isAdmin } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load branches";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
