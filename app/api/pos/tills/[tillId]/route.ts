import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import Till from "@/database/till.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { requirePermission } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
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
    const denied = requirePermission(await auth(), "/pos-settings");
    if (denied) return denied;
    const { tillId } = await context.params;
    if (!Types.ObjectId.isValid(tillId)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    await dbConnect();
    const till = await Till.findById(tillId).select("branchId").lean<{ branchId: Types.ObjectId } | null>();
    if (!till) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    const scoped = await resolvePosScope(await auth(), String(till.branchId));
    if (!scoped.ok) return scoped.response;
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
