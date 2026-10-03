import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import PosProduct from "@/database/posProduct.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";

const price = z.number().min(0).max(1e9);
const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().max(60).optional(),
    hsCode: z.string().trim().max(20).optional(),
    priceUsd: price.optional(),
    priceZwg: price.nullable().optional(),
    priceOnEntry: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

async function loadEditable(id: string) {
  const scoped = await resolvePosScope(await auth());
  if (!scoped.ok) return { response: scoped.response } as const;
  const { scope } = scoped;
  if (scope.role === "cashier") {
    return { response: NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 }) } as const;
  }
  if (!Types.ObjectId.isValid(id)) {
    return { response: NextResponse.json({ success: false, message: "Not found" }, { status: 404 }) } as const;
  }
  await dbConnect();
  const product = await PosProduct.findById(id);
  // Branch users may only touch their own branch's products; global ones are admin only.
  const allowed = product && (scope.isAdmin || (product.branchId && String(product.branchId) === scope.branchId));
  if (!product || !allowed) {
    return { response: NextResponse.json({ success: false, message: "Not found" }, { status: 404 }) } as const;
  }
  return { product } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const found = await loadEditable(id);
    if ("response" in found) return found.response;
    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid product" }, { status: 400 });
    }
    const { priceZwg, ...rest } = parsed.data;
    const update: Record<string, unknown> = {};
    if (Object.keys(rest).length) update.$set = rest;
    if (priceZwg === null) update.$unset = { priceZwg: "" };
    else if (priceZwg !== undefined) update.$set = { ...(update.$set as object), priceZwg };
    const product = await PosProduct.findByIdAndUpdate(id, update, { new: true });
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update product";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Soft delete: sold products keep their history, they just stop appearing at the till. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const found = await loadEditable(id);
    if ("response" in found) return found.response;
    await PosProduct.updateOne({ _id: id }, { $set: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove product";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
