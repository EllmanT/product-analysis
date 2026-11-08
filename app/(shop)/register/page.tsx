"use client";

import { SignUp } from "@clerk/nextjs";
import Logo from "@/components/brand/Logo";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ShopClerkSignUp() {
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  return (
    <SignUp
      forceRedirectUrl={redirectTo}
      signInUrl="/login"
      appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "shadow-2xl",
        },
      }}
    />
  );
}

export default function ShopRegisterPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <Logo size="lg" onDark className="mb-6 w-full justify-center" nameClassName="text-xl font-bold text-white" />
        <Suspense
          fallback={
            <div className="rounded-2xl bg-white p-12 text-center text-slate-600">
              Loading sign-up…
            </div>
          }
        >
          <ShopClerkSignUp />
        </Suspense>
        <p className="mt-6 text-center text-sm text-slate-400">
          Staff registration is by invitation only — use{" "}
          <Link
            href="/sign-in"
            className="font-medium text-sky-400 hover:text-sky-300 hover:underline"
          >
            staff sign-in
          </Link>{" "}
          if you work for the team.
        </p>
      </div>
    </div>
  );
}
