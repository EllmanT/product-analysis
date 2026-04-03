import { auth } from "@/auth";
import { Branch, Store } from "@/database";
import { getBranchesByStore } from "@/lib/actions/branch.action";
import { getUser } from "@/lib/actions/user.action";
import { requireAdmin, requireAuth, normalizeRole } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { AddBranchSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
export async function GET() {
  const session = await auth();
  const unauth = requireAuth(session);
  if (unauth) return unauth;

  const { success, data } = await getUser({ userId: session!.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const role = normalizeRole(data.user.role);

  if (role === "admin") {
    const { data: newData } = await getBranchesByStore({
      storeId: data.user.storeId,
    });
    return NextResponse.json({ success: true, data: newData }, { status: 200 });
  }

  await dbConnect();
  if (!data.user.branchId) {
    return NextResponse.json(
      { success: true, data: { branches: [] } },
      { status: 200 }
    );
  }

  const branch = await Branch.findOne({
    _id: data.user.branchId,
    storeId: data.user.storeId,
  })
    .populate("storeId", "name")
    .lean();

  const branches = branch ? [branch] : [];
  return NextResponse.json(
    {
      success: true,
      data: { branches: JSON.parse(JSON.stringify(branches)) },
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = AddBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  await dbConnect();
  const userId = session!.user.id;
  const [store] = await Store.find({ userId });
  if (!store) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const { name, location } = parsed.data;
  const existingBranch = await Branch.findOne({ name, location });
  if (existingBranch) {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const [newBranch] = await Branch.create([
    { name, location, storeId: store._id },
  ]);

  return NextResponse.json(
    { success: true, data: JSON.parse(JSON.stringify(newBranch)) },
    { status: 201 }
  );
}
