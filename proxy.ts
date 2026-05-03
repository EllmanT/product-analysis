import { clerkMiddleware } from "@clerk/nextjs/server";
import { getToken } from "next-auth/jwt";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const runClerk = clerkMiddleware();

export async function proxy(request: NextRequest, event: NextFetchEvent) {
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
    if (
      token?.role === "branch_user" &&
      (path.startsWith("/users") || path.startsWith("/branches"))
    ) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return runClerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/auth)|trpc)(.*)",
  ],
};
