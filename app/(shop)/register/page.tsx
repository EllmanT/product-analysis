"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ShopRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    tradeName: "",
    tinNumber: "",
    vatNumber: "",
    address: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/shop/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Registration failed");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-[#2563EB] focus:ring-2";
  const label = "block text-sm font-medium text-slate-700";

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Create account
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Register for StockFlow Shop
        </p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="reg-fn" className={label}>
                First Name
              </label>
              <input
                id="reg-fn"
                required
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-ln" className={label}>
                Last Name
              </label>
              <input
                id="reg-ln"
                required
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-email" className={label}>
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-pw" className={label}>
                Password
              </label>
              <input
                id="reg-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-phone" className={label}>
                Phone Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                required
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-trade" className={label}>
                Trade Name
              </label>
              <input
                id="reg-trade"
                required
                value={form.tradeName}
                onChange={(e) => update("tradeName", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-tin" className={label}>
                TIN Number
              </label>
              <input
                id="reg-tin"
                required
                value={form.tinNumber}
                onChange={(e) => update("tinNumber", e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reg-vat" className={label}>
                VAT Number
              </label>
              <input
                id="reg-vat"
                required
                value={form.vatNumber}
                onChange={(e) => update("vatNumber", e.target.value)}
                className={field}
              />
            </div>
          </div>
          <div>
            <label htmlFor="reg-addr" className={label}>
              Address
            </label>
            <textarea
              id="reg-addr"
              required
              rows={3}
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className={field}
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
            className="mt-2 w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60 md:max-w-xs md:self-start"
          >
            {loading ? "Creating…" : "Create Account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#2563EB] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
