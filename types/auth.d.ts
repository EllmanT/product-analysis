import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "admin" | "branch_user" | "cashier";
      /** What a non-admin may open and do. Undefined for admins (they may do everything). */
      perms?: string[];
    };
  }

  interface User {
    role?: "admin" | "branch_user" | "cashier";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "branch_user" | "cashier";
    perms?: string[];
  }
}
