import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getHiddenUrls, setHiddenUrls } from "@/lib/services/menuAccess.service";

/** Admin: what branch managers currently cannot see. */
export async function GET() {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  return NextResponse.json({ success: true, data: { hiddenUrls: await getHiddenUrls(), canEdit: isSuperAdmin(session) } });
}

const Body = z.object({ hiddenUrls: z.array(z.string().max(100)).max(100) }).strict();

/** Super admin only: choose which pages branch managers do not see. */
export async function PUT(request: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ success: false, message: "Only a super admin can change what each role sees." }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid menu settings" }, { status: 400 });
  const hiddenUrls = await setHiddenUrls(parsed.data.hiddenUrls, session!.user.id);
  return NextResponse.json({ success: true, data: { hiddenUrls } });
}
