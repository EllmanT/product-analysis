import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import User from "@/database/user.model";
import { normalizeRole, type AppRole } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";

export interface PosScope {
  userId: string;
  role: AppRole;
  isAdmin: boolean;
  /** Branch every query must be limited to. null only for an admin looking across branches. */
  branchId: string | null;
}

export type PosScopeResult = { ok: true; scope: PosScope } | { ok: false; response: NextResponse };

const deny = (status: number, message: string): PosScopeResult => ({
  ok: false,
  response: NextResponse.json({ success: false, message }, { status }),
});

/**
 * The single place that decides which branch a POS request may touch.
 * The role and branch come from the database, never from the request body or the JWT alone,
 * so a tampered `branchId` or a revoked user cannot reach another branch's sales.
 *
 * - admin: may pass any branch (or none, to see all branches)
 * - branch_user / cashier: always their own branch; asking for another one is a 403
 */
export async function resolvePosScope(
  session: Session | null,
  requestedBranchId?: string | null
): Promise<PosScopeResult> {
  const userId = session?.user?.id;
  if (!userId || !Types.ObjectId.isValid(userId)) return deny(401, "Not signed in");

  await dbConnect();
  const user = await User.findById(userId).select("role branchId").lean<{ role?: string; branchId?: Types.ObjectId }>();
  if (!user) return deny(401, "Not signed in");

  const role = normalizeRole(user.role);
  const requested = requestedBranchId?.trim() || null;
  if (requested && !Types.ObjectId.isValid(requested)) return deny(400, "Invalid branch");

  if (role === "admin") {
    return { ok: true, scope: { userId, role, isAdmin: true, branchId: requested } };
  }

  const own = user.branchId ? String(user.branchId) : null;
  if (!own) return deny(403, "Your account is not assigned to a branch");
  if (requested && requested !== own) return deny(403, "Not allowed for this branch");
  return { ok: true, scope: { userId, role, isAdmin: false, branchId: own } };
}
