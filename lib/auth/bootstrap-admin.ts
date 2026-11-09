import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

import Account from "@/database/account.model";
import User from "@/database/user.model";

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

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * First-login provisioning for the bootstrap admins, so a fresh deployment can be signed into
 * without sign-up or a seed script. When someone signs in with an email in BOOTSTRAP_ADMIN_EMAILS
 * and the password in BOOTSTRAP_ADMIN_PASSWORD, and that email has no email/password account yet,
 * the account is created (role admin) and the sign-in carries on normally.
 *
 * It only ever creates. It never changes an existing password, so once the admin has set their own
 * (Forgot password, or the profile page) the env password stops working for that email.
 * Returns true when it created something.
 */
export async function provisionBootstrapAdmin(
  email: string,
  password: string
): Promise<boolean> {
  const seed = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const normalized = email.trim().toLowerCase();
  if (!seed || !normalized || !getBootstrapAdminEmailSet().has(normalized)) return false;
  if (!sameSecret(password, seed)) return false;

  let user = await User.findOne({ email: normalized });
  if (!user) {
    try {
      user = await User.create({
        name: "Admin",
        surname: normalized.split("@")[0] || "User",
        email: normalized,
        role: "admin",
      });
    } catch {
      // Two first sign-ins at once: the other one won the unique-email race.
      user = await User.findOne({ email: normalized });
    }
  }
  if (!user) return false;

  const hasCredentials = await Account.exists({
    userId: user._id,
    provider: "credentials",
    providerAccountId: user.email,
  });
  if (hasCredentials) return false;

  await Account.create({
    userId: user._id,
    name: user.name,
    provider: "credentials",
    providerAccountId: user.email,
    password: await bcrypt.hash(seed, 12),
  });
  return true;
}
