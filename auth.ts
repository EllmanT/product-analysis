import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import Account from "./database/account.model";
import User from "./database/user.model";
import { authorizeCredentialsOrThrow } from "./lib/auth/authenticate-credentials";
import { getBootstrapAdminEmailSet } from "./lib/auth/bootstrap-admin";
import { normalizeRole } from "./lib/auth/role";
import { api } from "./lib/api";
import dbConnect from "./lib/mongoose";
import { SignInSchema } from "./lib/validations";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub,
    Google,
    Credentials({
      async authorize(credentials) {
        const validatedFields = SignInSchema.safeParse(credentials);

        if (!validatedFields.success) {
          return null;
        }

        const { email, password } = validatedFields.data;
        return await authorizeCredentialsOrThrow(email, password);
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = normalizeRole(token.role as string | undefined);
      return session;
    },
    async jwt({ token, user, account }) {
      if (account) {
        await dbConnect();
        if (account.type === "credentials" && token.email) {
          const emailTrimmed = token.email.trim();
          const emailRegex = new RegExp(
            `^${emailTrimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          );
          const existingUser = await User.findOne({ email: emailRegex });
          if (existingUser) {
            const existingAccount = await Account.findOne({
              userId: existingUser._id,
              provider: "credentials",
              providerAccountId: existingUser.email,
            }).sort({ updatedAt: -1 });
            if (existingAccount?.userId) {
              token.sub = existingAccount.userId.toString();
            }
          }
        } else if (account.provider && account.providerAccountId) {
          const existingAccount = await Account.findOne({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          });
          if (existingAccount?.userId) {
            token.sub = existingAccount.userId.toString();
          }
        }
      }

      if (user && "role" in user && user.role) {
        token.role = normalizeRole(user.role as string);
      }

      if (token.sub) {
        await dbConnect();
        const doc = await User.findById(token.sub)
          .select("role email")
          .lean();
        let role = normalizeRole(
          doc && "role" in doc ? (doc.role as string | undefined) : undefined
        );
        const email =
          doc && "email" in doc && doc.email
            ? String(doc.email).toLowerCase()
            : "";
        const bootstrap = getBootstrapAdminEmailSet();
        if (email && bootstrap.has(email)) {
          if (role !== "admin") {
            await User.updateOne(
              { _id: token.sub },
              { $set: { role: "admin" } }
            );
          }
          token.role = "admin";
        } else {
          token.role = role;
        }
      }

      return token;
    },
    async signIn({ user, profile, account }) {
      if (account?.type === "credentials") return true;

      if (!account || !user) return false;

      const userInfo = {
        name: user.name!,
        email: user.email!,
        image: user.image!,
        username:
          account.provider === "github"
            ? (profile?.login as string)
            : (user.name?.toLowerCase() as string),
      };

      const { success } = (await api.auth.oAuthSignIn({
        user: userInfo,
        provider: account.provider as "github" | "google",
        providerAccountId: account.providerAccountId,
      })) as ActionResponse;

      if (!success) return false;

      return true;
    },
  },
});
