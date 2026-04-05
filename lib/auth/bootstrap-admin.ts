/**
 * Comma-separated emails (case-insensitive) that receive admin on sign-in.
 * Persists `User.role = "admin"` on first match so production need not keep env forever.
 */
export function getBootstrapAdminEmailSet(): Set<string> {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}
