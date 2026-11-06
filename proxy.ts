import { clerkMiddleware } from "@clerk/nextjs/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiAllowed, defaultPermissions, landingFor, pageKeyForPath } from "@/lib/auth/permissions";

export default clerkMiddleware(async (_auth, request: NextRequest) => {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) {
    const token = await getToken({
      req: request,
      secret,
    });
    const role = token?.role;
    if (role === "branch_user" || role === "cashier") {
      // Admins may open everything. Everyone else only what a super admin has granted their role.
      const perms = token?.perms ?? defaultPermissions(role);
      const isApi = path.startsWith("/api/");

      if (isApi) {
        // Cashiers are confined to the till's own API unless they were granted more. Other roles are checked by each route.
        if (role === "cashier" && !apiAllowed(path, perms)) {
          return NextResponse.json({ success: false }, { status: 403 });
        }
      } else {
        const key = pageKeyForPath(path);
        const openPage = ["/scan", "/sign-in", "/unauthorized"].some((p) => path === p || path.startsWith(`${p}/`));
        // A cashier sees nothing outside the till except what was granted. Other roles keep the shop and account pages.
        const blocked = key ? !perms.includes(key) : role === "cashier" && !openPage;
        if (blocked) {
          const target = landingFor(perms);
          if (target !== path) return NextResponse.redirect(new URL(target, request.url));
        }
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/auth)|trpc)(.*)",
  ],
};
