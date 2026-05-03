"use client";

import { SignIn } from "@clerk/nextjs";
import { Warehouse } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ShopClerkSignIn() {
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  return (
    <SignIn
      forceRedirectUrl={redirectTo}
      signUpUrl="/register"
      appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "shadow-2xl",
        },
      }}
    />
  );
}

export default function ShopLoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
            <Warehouse className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            StockFlow
          </span>
        </div>
        <Suspense
          fallback={
            <div className="rounded-2xl bg-white p-12 text-center text-slate-600">
              Loading sign-in…
            </div>
          }
        >
          <ShopClerkSignIn />
        </Suspense>
        <p className="mt-6 text-center text-sm text-slate-400">
          Staff or internal access? Use{" "}
          <Link
            href="/sign-in"
            className="font-medium text-sky-400 hover:text-sky-300 hover:underline"
          >
            staff sign-in
          </Link>{" "}
          instead of this customer page.
        </p>
      </div>
    </div>
  );
}
