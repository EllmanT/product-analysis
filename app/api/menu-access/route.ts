import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAuth, normalizeRole } from "@/lib/auth/role";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getRolePermissions } from "@/lib/services/permissions.service";

/**
 * The signed-in user's own access: which pages and actions they hold (null for an admin, who holds everything)
 * and whether they may edit the rules. The sidebar builds itself from this.
 */
export async function GET() {
  const session = await auth();
  const denied = requireAuth(session);
  if (denied) return denied;
  const role = normalizeRole(session!.user.role);
  return NextResponse.json({
    success: true,
    data: {
      role,
      allowed: role === "admin" ? null : (session!.user.perms ?? (await getRolePermissions(role))),
      isSuperAdmin: isSuperAdmin(session),
    },
  });
}
