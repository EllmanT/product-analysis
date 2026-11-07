import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import Account from "@/database/account.model";
import Branch from "@/database/branch.model";
import User from "@/database/user.model";
import { normalizeRole, requireAuth } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";

/** The signed-in person's own details. Everyone may read and change their own name and password, nobody else's. */
export async function GET() {
  const session = await auth();
  const denied = requireAuth(session);
  if (denied) return denied;
  await dbConnect();
  const u = await User.findById(session!.user.id).select("name surname email role branchId").lean<{ name: string; surname: string; email: string; role?: string; branchId?: unknown }>();
  if (!u) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
  const branch = u.branchId ? await Branch.findById(u.branchId).select("name").lean<{ name: string }>() : null;
  const hasPassword = !!(await Account.exists({ userId: session!.user.id, provider: "credentials", password: { $exists: true, $ne: "" } }));
  return NextResponse.json({
    success: true,
    data: { name: u.name, surname: u.surname, email: u.email, role: normalizeRole(u.role), branch: branch?.name ?? null, hasPassword },
  });
}

const Body = z
  .object({
    name: z.string().trim().min(1, "Enter your first name").max(40).optional(),
    surname: z.string().trim().min(1, "Enter your surname").max(40).optional(),
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(8, "The new password must be at least 8 characters").max(200).optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  const session = await auth();
  const denied = requireAuth(session);
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  const { name, surname, currentPassword, newPassword } = parsed.data;
  await dbConnect();

  if (newPassword !== undefined) {
    const acct = await Account.findOne({ userId: session!.user.id, provider: "credentials" }).sort({ updatedAt: -1 });
    if (!acct?.password) {
      return NextResponse.json({ success: false, message: "This account signs in another way, so it has no password to change." }, { status: 409 });
    }
    if (!currentPassword || !(await bcrypt.compare(currentPassword, acct.password))) {
      return NextResponse.json({ success: false, message: "Your current password is not right." }, { status: 403 });
    }
    acct.password = await bcrypt.hash(newPassword, 12);
    await acct.save();
  }

  const $set: Record<string, string> = {};
  if (name !== undefined) $set.name = name;
  if (surname !== undefined) $set.surname = surname;
  if (Object.keys($set).length) await User.updateOne({ _id: session!.user.id }, { $set });
  return NextResponse.json({ success: true });
}
