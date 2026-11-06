import { auth } from "@/auth";
import { Branch } from "@/database";
import { getUser } from "@/lib/actions/user.action";
import dbConnect from "@/lib/mongoose";
import { requireStoreAccess } from "@/lib/analytics/requireStoreAccess";
import { NextResponse } from "next/server";

/** Signed-in user required. Returns a 401 response to send back, or null when allowed. */
export async function guardSignedIn(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Signed-in user who belongs to the given store (or any signed-in user when no store is given). */
export async function guardStore(storeId: string | null | undefined): Promise<NextResponse | null> {
  if (!storeId) return guardSignedIn();
  const { error } = await requireStoreAccess(storeId);
  return error ?? null;
}

/** Signed-in user who belongs to the store that owns the given branch. */
export async function guardBranch(branchId: string | null | undefined): Promise<NextResponse | null> {
  const unauth = await guardSignedIn();
  if (unauth) return unauth;
  if (!branchId) return NextResponse.json({ error: "Missing branch" }, { status: 400 });

  const session = await auth();
  const { success, data } = await getUser({ userId: session!.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }
  await dbConnect();
  const branch = await Branch.findById(branchId).select("storeId").lean<{ storeId?: unknown } | null>();
  if (!branch || String(branch.storeId) !== String(data.user.storeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
