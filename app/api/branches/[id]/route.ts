import { auth } from "@/auth";
import { Branch } from "@/database";
import { getUserStoreId } from "@/lib/auth/admin-store";
import { requirePermission } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requirePermission(session, "/branches");
  if (denied) return denied;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  await dbConnect();
  const storeId = await getUserStoreId(session!.user.id);
  if (!storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const branch = await Branch.findById(id);
  if (!branch) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  if (String(branch.storeId) !== storeId) {
    return NextResponse.json({ success: false }, { status: 403 });
  }

  await Branch.findByIdAndDelete(id);
  return NextResponse.json({ success: true }, { status: 200 });
}
