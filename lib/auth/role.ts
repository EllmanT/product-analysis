import type { Session } from "next-auth";
import { NextResponse } from "next/server";

export type AppRole = "admin" | "branch_user";

export function normalizeRole(
  role: string | undefined | null
): AppRole {
  return role === "admin" ? "admin" : "branch_user";
}

export function getSessionUserRole(session: Session | null): AppRole | null {
  if (!session?.user) return null;
  return normalizeRole(session.user.role);
}

export function requireAuth(session: Session | null) {
  if (!session?.user?.id) {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  return null;
}

export function requireAdmin(session: Session | null) {
  const unauth = requireAuth(session);
  if (unauth) return unauth;
  if (normalizeRole(session!.user.role) !== "admin") {
    return NextResponse.json({ success: false }, { status: 403 });
  }
  return null;
}
