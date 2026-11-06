import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { TillError, updateTill } from "@/lib/services/posTill.service";

const Body = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

/** Admin only: rename a till or switch it on or off. */
export async function PATCH(request: Request, context: { params: Promise<{ tillId: string }> }) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const { tillId } = await context.params;
    if (!Types.ObjectId.isValid(tillId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid till settings" }, { status: 400 });
    return NextResponse.json({ success: true, data: await updateTill(tillId, parsed.data) });
  } catch (error) {
    if (error instanceof TillError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update till";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
