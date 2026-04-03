"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ShopLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/shop/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Sign in failed");
        return;
      }
      router.push(redirectTo.startsWith("/") ? redirectTo : "/");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Access your StockFlow Shop account
        </p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <div>
            <label
              htmlFor="shop-login-email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="shop-login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="shop-login-password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="shop-login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-[#2563EB] focus:ring-2"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-[#2563EB] hover:underline"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ShopLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-100 px-4 py-12 text-slate-600">
          Loading…
        </div>
      }
    >
      <ShopLoginForm />
    </Suspense>
  );
}
