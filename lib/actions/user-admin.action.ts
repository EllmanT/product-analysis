"use server";

import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import Account from "@/database/account.model";
import Branch from "@/database/branch.model";
import User from "@/database/user.model";
import { escapeForEmailRegex } from "@/lib/auth/authenticate-credentials";
import { delegatedCreateRules } from "@/lib/auth/delegated-users";
import { resolveAdminStore } from "@/lib/auth/admin-store";
import { normalizeRole, requirePermission } from "@/lib/auth/role";
import handleError from "@/lib/handlers/error";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { CreateManagedUserSchema } from "@/lib/validations";

type CreateManagedUserParams = {
  name: string;
  surname: string;
  email: string;
  password: string;
  role: "admin" | "branch_user" | "cashier";
  branchId?: string;
};

/**
 * An administrator adds a staff member (admin, branch user or cashier) with email/password sign-in.
 *
 * Unlike the public sign-up action this does not depend on STAFF_ALLOWED_EMAILS (the admin is the
 * authority), takes the role and branch from the admin, derives the store from the branch/admin
 * (never from the client), and does NOT sign the new user in (the admin's own session is untouched).
 */
export async function createManagedUser(params: CreateManagedUserParams): Promise<ActionResponse<{ id: string }>> {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/users");
    if (denied) throw new ForbiddenError("Only administrators can add users.");

    const parsed = CreateManagedUserSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const { name, surname, password, role, branchId } = parsed.data;

    const notAllowed = await delegatedCreateRules(session, { role, branchId });
    if (notAllowed) throw new ForbiddenError(((await notAllowed.json()) as { message?: string }).message ?? "Not allowed.");
    const email = parsed.data.email.trim().toLowerCase();

    await dbConnect();

    const isAdmin = normalizeRole(session!.user.role) === "admin";
    let adminStoreId: string | null;
    if (isAdmin) {
      // Also repairs an admin with no linked store and branches left under another store they own.
      adminStoreId = await resolveAdminStore(session!.user.id);
    } else {
      const me = await User.findById(session!.user.id).select("storeId").lean();
      adminStoreId = me && !Array.isArray(me) && me.storeId ? String(me.storeId) : null;
    }
    if (!adminStoreId) throw new NotFoundError("Your account is not linked to a store.");

    let branchObjectId: string | undefined;
    if (branchId) {
      const branch = await Branch.findById(branchId).select("storeId").lean();
      if (!branch || Array.isArray(branch) || String(branch.storeId) !== adminStoreId) {
        throw new ValidationError({ branchId: ["That branch does not belong to your store."] });
      }
      branchObjectId = branchId;
    }

    const exists = await User.findOne({ email: new RegExp(`^${escapeForEmailRegex(email)}$`, "i") }).select("_id").lean();
    if (exists) throw new ValidationError({ email: ["A user with this email already exists."] });

    const user = await User.create({
      name,
      surname,
      email,
      role,
      storeId: adminStoreId,
      ...(branchObjectId ? { branchId: branchObjectId } : {}),
    });
    try {
      await Account.create({
        userId: user._id,
        name,
        provider: "credentials",
        providerAccountId: email,
        password: await bcrypt.hash(password, 12),
      });
    } catch (e) {
      // No transaction (works on a single-server database): undo the half-created user.
      await User.deleteOne({ _id: user._id });
      throw e;
    }

    return { success: true, data: { id: String(user._id) } };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
