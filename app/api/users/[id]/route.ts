import { NextResponse } from "next/server";

import User from "@/database/user.model";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import { requireAdmin } from "@/lib/auth/role";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { UpdateManagedUserSchema } from "@/lib/validations";

async function adminStoreId(sessionUserId: string): Promise<string | null> {
  const { success, data } = await getUser({ userId: sessionUserId });
  if (!success || !data?.user.storeId) return null;
  return String(data.user.storeId);
}

async function targetUserInStore(
  targetId: string,
  storeId: string
): Promise<boolean> {
  await dbConnect();
  const target = await User.findById(targetId).select("storeId").lean();
  if (!target || Array.isArray(target) || !target.storeId) return false;
  return String(target.storeId) === storeId;
}

/**
 * Intentionally not admin-gated: credentials sign-in loads the user via `api.users.getById`
 * before a session exists. Prefer not exposing extra fields here in the future.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) throw new NotFoundError("User not found");

  try {
    await dbConnect();
    const user = await User.findById(id);
    if (!user) throw new NotFoundError("User not found");
    return NextResponse.json({ success: true, data: user }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) throw new NotFoundError("User not found");

  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    if (id === session!.user.id) {
      return NextResponse.json(
        { success: false, error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const storeId = await adminStoreId(session!.user.id);
    if (!storeId) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const ok = await targetUserInStore(id, storeId);
    if (!ok) {
      return NextResponse.json({ success: false }, { status: 403 });
    }

    await dbConnect();
    const user = await User.findByIdAndDelete(id);
    if (!user) throw new NotFoundError("User not found");
    return NextResponse.json({ success: true, data: user }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) throw new NotFoundError("User not found");

  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const storeId = await adminStoreId(session!.user.id);
    if (!storeId) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const ok = await targetUserInStore(id, storeId);
    if (!ok) {
      return NextResponse.json({ success: false }, { status: 403 });
    }

    const body = await request.json();
    const parsed = UpdateManagedUserSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldEntries = Object.entries(flat.fieldErrors).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].length > 0
      );
      const details = Object.fromEntries(fieldEntries) as Record<
        string,
        string[]
      >;
      if (flat.formErrors.length) {
        details.form = flat.formErrors;
      }
      throw new ValidationError(
        Object.keys(details).length > 0
          ? details
          : { form: ["Invalid request body"] }
      );
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) {
      patch.role = parsed.data.role;
    }
    if (parsed.data.branchId !== undefined) {
      patch.branchId = parsed.data.branchId;
    }

    await dbConnect();
    const updatedUser = await User.findByIdAndUpdate(id, patch, {
      new: true,
    });
    if (!updatedUser) throw new NotFoundError("User not found");
    return NextResponse.json(
      { success: true, data: updatedUser },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
