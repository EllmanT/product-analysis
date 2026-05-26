import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import { NextResponse } from "next/server";

export async function requireStoreAccess(requestedStoreId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  }

  if (String(data.user.storeId) !== requestedStoreId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user: data.user };
}
