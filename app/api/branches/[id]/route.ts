import { auth } from "@/auth";
import { Branch, Store } from "@/database";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  await dbConnect();
  const [store] = await Store.find({ userId: session!.user.id });
  if (!store) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const branch = await Branch.findById(id);
  if (!branch) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  if (String(branch.storeId) !== String(store._id)) {
    return NextResponse.json({ success: false }, { status: 403 });
  }

  await Branch.findByIdAndDelete(id);
  return NextResponse.json({ success: true }, { status: 200 });
}
