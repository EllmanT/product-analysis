import { auth } from "@/auth";
import { Branch } from "@/database";
import { getBranchesByStore } from "@/lib/actions/branch.action";
import { getUser } from "@/lib/actions/user.action";
import { resolveAdminStore } from "@/lib/auth/admin-store";
import { requirePermission, requireAuth, normalizeRole } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { AddBranchSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
export async function GET() {
  const session = await auth();
  const unauth = requireAuth(session);
  if (unauth) return unauth;

  if (normalizeRole(session!.user.role) === "admin") {
    // Link the admin to their store and gather branches made under another store they own.
    await resolveAdminStore(session!.user.id);
  }

  const { success, data } = await getUser({ userId: session!.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const role = normalizeRole(data.user.role);

  if (role === "admin") {
    const { success: listed, data: newData } = await getBranchesByStore({
      storeId: String(data.user.storeId),
    });
    if (!listed || !newData) {
      return NextResponse.json({ success: false }, { status: 500 });
    }
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
  const denied = requirePermission(session, "/branches");
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
  const storeId = await resolveAdminStore(session!.user.id);
  if (!storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const { name, location } = parsed.data;
  const existingBranch = await Branch.findOne({ name, location, storeId });
  if (existingBranch) {
    return NextResponse.json({ success: false }, { status: 409 });
  }

  const [newBranch] = await Branch.create([{ name, location, storeId }]);

  return NextResponse.json(
    { success: true, data: JSON.parse(JSON.stringify(newBranch)) },
    { status: 201 }
  );
}
