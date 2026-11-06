import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import User from "@/database/user.model";
import { normalizeRole } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";

const refuse = (message: string, status = 403) => NextResponse.json({ success: false, error: { message }, message }, { status });

export interface UserChange {
  /** The person being changed or removed. Leave out when creating someone. */
  targetId?: string;
  /** Role being set. */
  newRole?: string;
  /** Branch being set. */
  newBranchId?: string | null;
}

/**
 * Extra rules for someone who is NOT an admin but was granted the Users page. Admins pass untouched.
 * A delegated user manager looks after their own branch only: they cannot make an administrator, cannot touch one,
 * cannot change their own role, and cannot move anyone to another branch. Without this, the Users grant would be a
 * way to promote yourself.
 * Returns a response to send back when the change is refused, or null when it may go ahead.
 */
export async function delegatedUserRules(session: Session | null, change: UserChange): Promise<NextResponse | null> {
  if (!session?.user?.id) return refuse("Not signed in", 401);
  if (normalizeRole(session.user.role) === "admin") return null;

  await dbConnect();
  const me = await User.findById(session.user.id).select("branchId").lean<{ branchId?: Types.ObjectId } | null>();
  const myBranch = me?.branchId ? String(me.branchId) : null;
  if (!myBranch) return refuse("Your account is not assigned to a branch, so you cannot manage users.");

  if (change.newRole === "admin") return refuse("Only an administrator can make someone an administrator.");
  if (change.newBranchId && change.newBranchId !== myBranch) return refuse("You can only manage people in your own branch.");

  if (change.targetId) {
    if (!Types.ObjectId.isValid(change.targetId)) return refuse("Not found", 404);
    const target = await User.findById(change.targetId).select("role branchId").lean<{ role?: string; branchId?: Types.ObjectId } | null>();
    if (!target) return refuse("Not found", 404);
    if (normalizeRole(target.role) === "admin") return refuse("Only an administrator can change an administrator.");
    if (String(target.branchId ?? "") !== myBranch) return refuse("You can only manage people in your own branch.");
    if (change.targetId === session.user.id && change.newRole !== undefined) return refuse("You cannot change your own role.");
  }
  return null;
}

/** For a new person: they must end up in the caller's own branch and never as an admin. */
export async function delegatedCreateRules(session: Session | null, input: { role?: string; branchId?: string | null }): Promise<NextResponse | null> {
  const blocked = await delegatedUserRules(session, { newRole: input.role, newBranchId: input.branchId ?? undefined });
  if (blocked) return blocked;
  if (session && normalizeRole(session.user.role) !== "admin" && !input.branchId) {
    return refuse("Choose your branch for the new person.", 400);
  }
  return null;
}

/** The branch a non-admin user manager works in, or null for an admin (who sees everyone). */
export async function managerBranchId(session: Session | null): Promise<string | null | "none"> {
  if (!session?.user?.id) return "none";
  if (normalizeRole(session.user.role) === "admin") return null;
  await dbConnect();
  const me = await User.findById(session.user.id).select("branchId").lean<{ branchId?: Types.ObjectId } | null>();
  return me?.branchId ? String(me.branchId) : "none";
}
