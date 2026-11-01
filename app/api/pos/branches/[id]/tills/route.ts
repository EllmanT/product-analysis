import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { listTills, setTillCount, TillError } from "@/lib/services/posTill.service";

/**
 * The branch's tills. Cashiers get the enabled ones (to pick which till they are on); an admin can
 * pass ?all=1 to see switched-off tills too.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const scoped = await resolvePosScope(await auth(), id);
    if (!scoped.ok) return scoped.response;
    const includeDisabled = scoped.scope.isAdmin && new URL(request.url).searchParams.get("all") === "1";
    return NextResponse.json({ success: true, data: await listTills(id, { includeDisabled }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list tills";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

const Body = z.object({ count: z.number().int().min(0).max(50) }).strict();

/** Admin only: set how many tills the branch has. Extra tills are switched off, never deleted. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const { id } = await context.params;
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid number of tills" }, { status: 400 });
    const scoped = await resolvePosScope(await auth(), id);
    if (!scoped.ok) return scoped.response;
    return NextResponse.json({ success: true, data: await setTillCount(id, parsed.data.count) });
  } catch (error) {
    if (error instanceof TillError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to set tills";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
