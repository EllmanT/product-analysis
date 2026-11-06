import { clerkMiddleware } from "@clerk/nextjs/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
    // Cashiers are confined to the POS: every other page or API is closed to them.
    if (token?.role === "cashier") {
      const allowed = ["/pos", "/api/pos", "/scan", "/api/scan", "/sign-in", "/unauthorized"];
      const ok = allowed.some((p) => path === p || path.startsWith(`${p}/`));
      if (!ok) {
        if (path.startsWith("/api/")) {
          return NextResponse.json({ success: false }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/pos", request.url));
      }
    }
    if (
      token?.role === "branch_user" &&
      (path.startsWith("/users") || path.startsWith("/branches") || path.startsWith("/pos-settings") || path.startsWith("/access"))
    ) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
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
