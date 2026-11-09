import bcrypt from "bcryptjs";

import Account from "@/database/account.model";
import User from "@/database/user.model";
import dbConnect from "@/lib/mongoose";

import { ensureBootstrapAdminStore, provisionBootstrapAdmin } from "./bootstrap-admin";
import { DetailedCredentialsSignin } from "./credentials-signin-error";
import { normalizeRole } from "./role";

export function escapeForEmailRegex(value: string): string {
  return value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validates email/password against MongoDB (same rules as the former server action).
 * Used by NextAuth `authorize` and kept in one place so production never depends on
 * a loopback HTTP call to /api/accounts/provider.
 */
export async function authorizeCredentialsOrThrow(
  email: string,
  password: string
) {
  await dbConnect();
  // Fresh deployment: a bootstrap admin signing in with the env password gets their account created.
  await provisionBootstrapAdmin(email, password);

  const emailTrimmed = email.trim();
  const emailRegex = new RegExp(`^${escapeForEmailRegex(emailTrimmed)}$`, "i");
  const existingUser = await User.findOne({ email: emailRegex });
  if (!existingUser) {
    throw new DetailedCredentialsSignin(
      "No user found for this email address.",
      "user_not_found"
    );
  }

  const existingAccount = await Account.findOne({
    userId: existingUser._id,
    provider: "credentials",
    providerAccountId: existingUser.email,
  }).sort({ updatedAt: -1 });

  if (!existingAccount) {
    throw new DetailedCredentialsSignin(
      "This account does not have email and password sign-in set up.",
      "no_credentials_account"
    );
  }

  if (!existingAccount.password) {
    throw new DetailedCredentialsSignin(
      "No password is stored for this account. Use “Forgot password” to create one.",
      "missing_password"
    );
  }

  const isValid = await bcrypt.compare(password, existingAccount.password);
  if (!isValid) {
    throw new DetailedCredentialsSignin(
      "Incorrect email or password.",
      "invalid_password"
    );
  }

  // A bootstrap admin needs a store for the dashboard to open; create it now (and repair older accounts).
  await ensureBootstrapAdminStore(existingUser);

  // Users with an email/password account are provisioned by an administrator (Users screen) or by
  // the allow-listed self sign-up, so the stored role decides what they can do. The allow-list is
  // NOT checked here: it only controls who may register themselves or sign in with Google/GitHub.

  return {
    id: existingUser.id,
    name: existingUser.name,
    email: existingUser.email,
    image: existingUser.image,
    role: normalizeRole(existingUser.role),
  };
}
