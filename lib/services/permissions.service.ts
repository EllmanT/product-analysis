import RoleMenu from "@/database/roleMenu.model";
import RolePermission from "@/database/rolePermission.model";
import { type AppRoleName, defaultPermissions, GRANTABLE_KEYS } from "@/lib/auth/permissions";
import dbConnect from "@/lib/mongoose";

/** Roles a super admin can edit. Admin is fixed so nobody can lock themselves out. */
export const EDITABLE_ROLES = ["branch_user", "cashier"] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; allowed: string[] }>();

/** The permissions a role holds right now. Cached for a few seconds because every request asks. */
export async function getRolePermissions(role: AppRoleName): Promise<string[]> {
  if (role === "admin") return defaultPermissions("admin");
  const hit = cache.get(role);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.allowed;

  await dbConnect();
  const doc = await RolePermission.findOne({ role }).lean<{ allowed?: string[] } | null>();
  let allowed: string[];
  if (doc?.allowed) {
    allowed = doc.allowed.filter((k) => GRANTABLE_KEYS.has(k));
  } else if (role === "branch_user") {
    // Rules saved by the first version of Menu access listed only the pages to hide.
    const old = await RoleMenu.findOne({ role }).lean<{ hiddenUrls?: string[] } | null>();
    const hidden = new Set(old?.hiddenUrls ?? []);
    allowed = defaultPermissions(role).filter((k) => !hidden.has(k));
  } else {
    allowed = defaultPermissions(role);
  }
  cache.set(role, { at: Date.now(), allowed });
  return allowed;
}

export async function setRolePermissions(role: EditableRole, keys: string[], userId: string): Promise<string[]> {
  await dbConnect();
  const clean = [...new Set(keys)].filter((k) => GRANTABLE_KEYS.has(k));
  await RolePermission.updateOne({ role }, { $set: { allowed: clean, updatedBy: userId } }, { upsert: true });
  cache.delete(role);
  return clean;
}
