import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import Branch from "@/database/branch.model";
import { requirePermission } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { assignBranchDevice, DeviceConfigError } from "@/lib/services/fiscalDevice.service";
import { getPosBranch } from "@/lib/services/posBranch.service";

const text = (max: number) => z.string().trim().max(max).optional();

const PatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "1 to 4 letters or digits").optional(),
    taxPercent: z.number().min(0).max(100).optional(),
    taxCode: z.string().trim().min(1).max(4).optional(),
    defaultCurrency: z.enum(["USD", "ZWG"]).optional(),
    /** null = no limit: the till keeps selling offline for as long as it needs to. */
    offlineLimitHours: z.number().min(0.25).max(24 * 30).nullable().optional(),
    /** FiscalDevice id for a branch with its own device; null = use the central device. */
    fiscalDeviceId: z.string().regex(/^[a-f0-9]{24}$/, "Invalid device").nullable().optional(),
    receipt: z
      .object({
        companyName: text(120),
        branchName: text(120),
        address: text(200),
        phone: text(40),
        email: z.string().trim().email().max(120).optional().or(z.literal("")),
        tin: text(40),
        vatNumber: text(40),
        logoUrl: text(500),
        footerLines: z.array(z.string().trim().max(80)).max(6).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Admin only: enable POS for a branch and set its prefix, VAT, offline limit and slip details. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = requirePermission(await auth(), "/pos-settings");
    if (denied) return denied;

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? "Invalid settings" },
        { status: 400 }
      );
    }

    await dbConnect();
    const { receipt, fiscalDeviceId, ...rest } = parsed.data;
    const $set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) $set[`pos.${k}`] = v;
    for (const [k, v] of Object.entries(receipt ?? {})) $set[`pos.receipt.${k}`] = v;
    if (Object.keys($set).length === 0 && fiscalDeviceId === undefined) {
      return NextResponse.json({ success: false, message: "Nothing to change" }, { status: 400 });
    }

    // Enabling POS needs a prefix: the slip number is built from it.
    const existing = await Branch.findById(id).select("pos.invoicePrefix").lean<{ pos?: { invoicePrefix?: string } }>();
    if (!existing) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    const prefixAfter = (rest.invoicePrefix ?? existing.pos?.invoicePrefix) || "";
    if (rest.enabled && !prefixAfter) {
      return NextResponse.json({ success: false, message: "Set an invoice prefix before enabling POS" }, { status: 400 });
    }

    try {
      if (Object.keys($set).length) await Branch.updateOne({ _id: id }, { $set });
      if (fiscalDeviceId !== undefined) await assignBranchDevice(id, fiscalDeviceId);
    } catch (e) {
      if (e instanceof DeviceConfigError) {
        return NextResponse.json({ success: false, message: e.message }, { status: 422 });
      }
      if ((e as { code?: number }).code === 11000) {
        return NextResponse.json({ success: false, message: "Another branch already uses this prefix" }, { status: 409 });
      }
      throw e;
    }
    return NextResponse.json({ success: true, data: await getPosBranch(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
