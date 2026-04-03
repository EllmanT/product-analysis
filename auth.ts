import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { IAccountDoc } from "./database/account.model";
import User, { IUserDoc } from "./database/user.model";
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

        if (validatedFields.success) {
          const { email, password } = validatedFields.data!;

          console.log("email", email)
          const newVariable=email;
          console.log("new variable", newVariable)
          const { data: existingAccount } = (await api.accounts.getByProvider(
            newVariable
          )) as ActionResponse<IAccountDoc>;
                console.log("in the sign in 03")

          if (!existingAccount) return null;
          const { data: existingUser } = (await api.users.getById(
            existingAccount.userId.toString()
          )) as ActionResponse<IUserDoc>;
      console.log("in the sign in 04")

          if (!existingUser) return null;

          const isValidPassword = await bcrypt.compare(
            password,
            existingAccount.password!
          );

          console.log("isValidPassword", isValidPassword)
                console.log("in the sign in 05")


          if (isValidPassword) {
            return {
              id: existingUser.id,
              name: existingUser.name,
              email: existingUser.email,
              image: existingUser.image,
              role: normalizeRole(existingUser.role),
            };
          }
        }
        return null;
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
        const { data: existingAccount, success } =
          (await api.accounts.getByProvider(
            account.type === "credentials"
              ? token.email!
              : account.providerAccountId
          )) as ActionResponse<IAccountDoc>;

        if (!success || !existingAccount) return token;

        const userId = existingAccount.userId;

        if (userId) token.sub = userId.toString();
      }

      if (user && "role" in user && user.role) {
        token.role = normalizeRole(user.role as string);
      }

      if (token.sub) {
        await dbConnect();
        const doc = await User.findById(token.sub).select("role").lean();
        token.role = normalizeRole(
          doc && "role" in doc ? (doc.role as string | undefined) : undefined
        );
      }

      return token;
    },
    async signIn({ user, profile, account }) {
      console.log("in the sign in 1")
      if (account?.type === "credentials") return true;
            console.log("in the sign in 2")

      if (!account || !user) return false;
      console.log("in the sign in 3")

      const userInfo = {
        name: user.name!,
        email: user.email!,
        image: user.image!,
        username:
          account.provider === "github"
            ? (profile?.login as string)
            : (user.name?.toLowerCase() as string),
      };
            console.log("in the sign in 4")


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
