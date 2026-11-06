import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { EDITABLE_ROLES, getRolePermissions, setRolePermissions } from "@/lib/services/permissions.service";

/** Admin: what each editable role may open and do right now. */
export async function GET() {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  const [branch_user, cashier] = await Promise.all([getRolePermissions("branch_user"), getRolePermissions("cashier")]);
  return NextResponse.json({ success: true, data: { roles: { branch_user, cashier }, canEdit: isSuperAdmin(session) } });
}

const Body = z.object({ role: z.enum(EDITABLE_ROLES), allowed: z.array(z.string().max(100)).max(200) }).strict();

/** Super admin only: set what one role may open and do. Admin cannot be edited, so nobody can lock themselves out. */
export async function PUT(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ success: false, message: "Only a super admin can change what each role can do." }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid access settings" }, { status: 400 });
  const allowed = await setRolePermissions(parsed.data.role, parsed.data.allowed, session!.user.id);
  return NextResponse.json({ success: true, data: { role: parsed.data.role, allowed } });
}
