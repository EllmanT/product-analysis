import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "admin" | "branch_user";
    };
  }

  interface User {
    role?: "admin" | "branch_user";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "branch_user";
  }
}
