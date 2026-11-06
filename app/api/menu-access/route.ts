import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAuth, normalizeRole } from "@/lib/auth/role";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getHiddenUrls } from "@/lib/services/menuAccess.service";

/** The signed-in user's own menu settings: which pages are hidden from them, and whether they can edit the rules. */
export async function GET() {
  const session = await auth();
  const denied = requireAuth(session);
  if (denied) return denied;
  const role = normalizeRole(session!.user.role);
  return NextResponse.json({
    success: true,
    data: {
      role,
      hiddenUrls: role === "branch_user" ? await getHiddenUrls() : [],
      isSuperAdmin: isSuperAdmin(session),
    },
  });
}
