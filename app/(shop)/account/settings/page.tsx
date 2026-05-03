"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type CustomerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tradeName: string;
  tinNumber: string;
  vatNumber: string;
  address: string;
  buyerType: "individual" | "business";
};

export default function AccountSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    tradeName: "",
    tinNumber: "",
    vatNumber: "",
    address: "",
    buyerType: "individual" as "individual" | "business",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/shop/customer/me", { credentials: "include" });
    if (res.status === 401) {
      router.replace("/login?redirect=/account/settings");
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data: CustomerProfile };
      if (json.success && json.data) {
        setProfile(json.data);
        setForm({
          firstName: json.data.firstName,
          lastName: json.data.lastName,
          phone: json.data.phone,
          tradeName: json.data.tradeName,
          tinNumber: json.data.tinNumber,
          vatNumber: json.data.vatNumber,
          address: json.data.address,
          buyerType: json.data.buyerType === "business" ? "business" : "individual",
        });
      }
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/shop/customer/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: { message?: string };
        data?: CustomerProfile;
      };
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not save your details.");
        return;
      }
      if (json.success && json.data) {
        setProfile(json.data);
        toast.success("Your details have been updated.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="min-h-[50vh] bg-[#F8FAFC]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-sm text-slate-500">Loading settings…</p>
        </div>
      </div>
    );
  }

  const isBusiness = form.buyerType === "business";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-2 text-sm text-slate-500">
          <Link href="/account" className="hover:text-[#1E40AF]">
            Dashboard
          </Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">Settings</span>
        </nav>

        <h1 className="font-shop-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Account settings
        </h1>
        <p className="mt-2 text-slate-600">
          Choose whether you buy as an individual or on behalf of a business. We only need company
          name, TIN, and VAT for <strong>business</strong> accounts when you want those on
          quotations and invoices. Your email comes from your sign-in and cannot be changed here.
        </p>

        <form
          onSubmit={handleSave}
          className="mt-8 space-y-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:p-8"
        >
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">How you buy</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-[:checked]:border-[#1E40AF] has-[:checked]:bg-blue-50/50">
                <input
                  type="radio"
                  name="buyerType"
                  checked={form.buyerType === "individual"}
                  onChange={() =>
                    setForm((f) => ({ ...f, buyerType: "individual" }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Personal</span>
                  <span className="text-xs text-slate-500">
                    Purchases for yourself. No company tax details on documents unless you add them
                    later.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-[:checked]:border-[#1E40AF] has-[:checked]:bg-blue-50/50">
                <input
                  type="radio"
                  name="buyerType"
                  checked={form.buyerType === "business"}
                  onChange={() =>
                    setForm((f) => ({ ...f, buyerType: "business" }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Business</span>
                  <span className="text-xs text-slate-500">
                    Buying for a company. Quotations and invoices can show company name, TIN, and
                    VAT.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                First name
              </label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
                autoComplete="given-name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                Last name
              </label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
                autoComplete="family-name"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <Input id="email" type="email" value={profile.email} readOnly disabled className="h-11 bg-slate-50" />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-slate-700">
              Phone
            </label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
              autoComplete="tel"
              className="h-11"
            />
          </div>

          {isBusiness ? (
            <>
              <div className="space-y-2">
                <label htmlFor="tradeName" className="text-sm font-medium text-slate-700">
                  Company / trade name
                </label>
                <Input
                  id="tradeName"
                  value={form.tradeName}
                  onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))}
                  required
                  autoComplete="organization"
                  className="h-11"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="tinNumber" className="text-sm font-medium text-slate-700">
                    TIN
                  </label>
                  <Input
                    id="tinNumber"
                    value={form.tinNumber}
                    onChange={(e) => setForm((f) => ({ ...f, tinNumber: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="vatNumber" className="text-sm font-medium text-slate-700">
                    VAT number
                  </label>
                  <Input
                    id="vatNumber"
                    value={form.vatNumber}
                    onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium text-slate-700">
              Address
            </label>
            <textarea
              id="address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              required
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={saving} className="min-w-[140px]">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>

        <div className="mt-8 rounded-xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:p-8">
          <h2 className="font-shop-display text-lg font-semibold tracking-tight text-slate-900">
            Sign-in &amp; security
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            You sign in to the shop with email, password, and/or Google through our sign-in
            provider. To change your password, reset it from the{" "}
            <Link href="/login" className="text-[#1E40AF] underline">
              sign-in page
            </Link>{" "}
            (Forgot password). To manage social accounts, use the same sign-in options as when you
            registered.
          </p>
        </div>
      </div>
    </div>
  );
}
