import { Types } from "mongoose";

import Branch from "@/database/branch.model";
import Store from "@/database/store.model";
import User from "@/database/user.model";
import dbConnect from "@/lib/mongoose";

/**
 * The store a signed-in user belongs to, read from their user record (`User.storeId`).
 *
 * This is the one definition of "my store". The Users page lists branches by it and
 * `createManagedUser` only accepts branches that belong to it, so a branch must be created
 * under the same store. Looking the store up by `Store.userId` instead can return a different
 * store (an admin who owns several, or one added later who owns none), which made new branches
 * invisible when adding a user.
 *
 * Returns null when the user is unknown or not linked to a store.
 */
export async function getUserStoreId(userId: string | null | undefined): Promise<string | null> {
  if (!userId || !Types.ObjectId.isValid(userId)) return null;
  await dbConnect();
  const user = await User.findById(userId).select("storeId").lean<{ storeId?: Types.ObjectId | null } | null>();
  return user?.storeId ? String(user.storeId) : null;
}

/**
 * The store an administrator manages, repairing the two ways their data can be out of step.
 *
 * - The user record has no store but the admin owns one: link the oldest owned store, so they are
 *   not locked out of branches and users.
 * - Branches sit under another store this same admin owns (made before the store lookup was fixed):
 *   move them to the primary store, so they show up when adding users and every store-scoped check
 *   (`guardBranch`, `createManagedUser`) agrees. Only stores the admin owns are touched.
 *
 * Idempotent and cheap once everything is in step. Returns null when the admin has no store at all.
 */
export async function resolveAdminStore(userId: string | null | undefined): Promise<string | null> {
  if (!userId || !Types.ObjectId.isValid(userId)) return null;
  await dbConnect();

  const user = await User.findById(userId).select("storeId").lean<{ storeId?: Types.ObjectId | null } | null>();
  if (!user) return null;

  const owned = await Store.find({ userId }).sort({ _id: 1 }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const ownedIds = owned.map((s) => String(s._id));

  let primary = user.storeId ? String(user.storeId) : null;
  if (!primary) {
    if (ownedIds.length === 0) return null;
    primary = ownedIds[0];
    await User.updateOne({ _id: userId, $or: [{ storeId: null }, { storeId: { $exists: false } }] }, { $set: { storeId: primary } });
  }

  const others = ownedIds.filter((id) => id !== primary).map((id) => new Types.ObjectId(id));
  if (others.length > 0) {
    await Branch.updateMany({ storeId: { $in: others } }, { $set: { storeId: new Types.ObjectId(primary) } });
  }
  return primary;
}
