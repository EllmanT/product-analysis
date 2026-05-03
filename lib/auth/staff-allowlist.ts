import { getBootstrapAdminEmailSet } from "./bootstrap-admin";

/**
 * Emails allowed to use the staff app (NextAuth `/sign-in`, `(admin)` routes).
 * Set `STAFF_ALLOWED_EMAILS` to a comma-separated list.
 * If unset, falls back to `BOOTSTRAP_ADMIN_EMAILS` for backward compatibility.
 */
export function getStaffAllowedEmailSet(): Set<string> {
  const raw = process.env.STAFF_ALLOWED_EMAILS ?? "";
  const fromEnv = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  if (fromEnv.size > 0) {
    return fromEnv;
  }
  return getBootstrapAdminEmailSet();
}

export function isStaffEmailAllowed(
  email: string | null | undefined
): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return getStaffAllowedEmailSet().has(normalized);
}
