import { NextResponse } from "next/server";

import { auth } from "@/auth";
import PosCustomer from "@/database/posCustomer.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { CustomerCreateSchema } from "@/lib/pos/customerSchema";

/** Every active customer (tills search them in the browser). `?manage=1` includes inactive ones. */
export async function GET(request: Request) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    const manage = new URL(request.url).searchParams.get("manage") === "1" && scoped.scope.role !== "cashier";
    await dbConnect();
    const rows = await PosCustomer.find(manage ? {} : { isActive: true })
      .sort({ name: 1 })
      .limit(10_000)
      .lean();
    return NextResponse.json({ success: true, data: rows.map((r) => ({ ...r, _id: String(r._id) })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load customers";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scoped = await resolvePosScope(await auth());
    if (!scoped.ok) return scoped.response;
    if (scoped.scope.role === "cashier") {
      return NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 });
    }
    const parsed = CustomerCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid customer" }, { status: 400 });
    }
    await dbConnect();
    const dup = await PosCustomer.findOne({ name: parsed.data.name, isActive: true }).collation({ locale: "en", strength: 2 });
    if (dup) return NextResponse.json({ success: false, message: "A customer with this name already exists" }, { status: 409 });
    const customer = await PosCustomer.create(parsed.data);
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create customer";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
