import type { Session } from "next-auth";

import { getBootstrapAdminEmailSet } from "@/lib/auth/bootstrap-admin";
import { normalizeRole } from "@/lib/auth/role";

/**
 * A super admin is an admin whose email is in BOOTSTRAP_ADMIN_EMAILS. They may change what each role sees.
 * When that list is empty (local setups) any admin counts, so nobody is locked out of the screen.
 */
export function isSuperAdmin(session: Session | null): boolean {
  if (!session?.user?.id || normalizeRole(session.user.role) !== "admin") return false;
  const allowed = getBootstrapAdminEmailSet();
  if (allowed.size === 0) return true;
  return allowed.has((session.user.email ?? "").toLowerCase());
}
