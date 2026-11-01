import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import PosCustomer from "@/database/posCustomer.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { CustomerPatchSchema } from "@/lib/pos/customerSchema";

async function guard(id: string) {
  const scoped = await resolvePosScope(await auth());
  if (!scoped.ok) return scoped.response;
  if (scoped.scope.role === "cashier") return NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 });
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await guard(id);
    if (denied) return denied;
    const parsed = CustomerPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid customer" }, { status: 400 });
    }
    await dbConnect();
    const customer = await PosCustomer.findByIdAndUpdate(id, { $set: parsed.data }, { new: true });
    if (!customer) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update customer";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Customers are archived, never deleted: past invoices keep their own copy of the details. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const denied = await guard(id);
    if (denied) return denied;
    await dbConnect();
    await PosCustomer.updateOne({ _id: id }, { $set: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to archive customer";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
