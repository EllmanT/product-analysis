"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useCart } from "@/app/(shop)/context/CartContext";

type MeData = {
  tradeName: string;
  tinNumber: string;
  vatNumber: string;
  phone: string;
  address: string;
};

function formatMoney(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function lineAmount(price: string, qty: number): string {
  const u = parseFloat(price);
  if (Number.isNaN(u)) return "0.00";
  return (u * qty).toFixed(2);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart } = useCart();
  const [loadingMe, setLoadingMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MeData>({
    tradeName: "",
    tinNumber: "",
    vatNumber: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    if (items.length === 0) {
      router.replace("/cart");
    }
  }, [items.length, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/shop/customer/me", { credentials: "include" });
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (!res.ok) {
        setLoadingMe(false);
        setError("Could not load your profile.");
        return;
      }
      const json = (await res.json()) as {
        success: boolean;
        data: MeData;
      };
      if (json.success && json.data) {
        setForm({
          tradeName: json.data.tradeName ?? "",
          tinNumber: json.data.tinNumber ?? "",
          vatNumber: json.data.vatNumber ?? "",
          phone: json.data.phone ?? "",
          address: json.data.address ?? "",
        });
      }
      setLoadingMe(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const subtotal = items.reduce((sum, row) => {
    const n = parseFloat(lineAmount(row.price, row.quantity));
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/shop/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            standardCode: i.standardCode,
            price: i.price,
            quantity: i.quantity,
          })),
          tradeName: form.tradeName,
          tinNumber: form.tinNumber,
          vatNumber: form.vatNumber,
          phone: form.phone,
          address: form.address,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Request failed");
        return;
      }
      const id = json?.data?._id as string | undefined;
      if (!id) {
        setError("Invalid response from server");
        return;
      }
      clearCart();
      router.push(`/quotations/${id}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function field(
    id: keyof MeData,
    label: string,
    multiline?: boolean
  ) {
    const base =
      "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-[#2563EB] focus:ring-2";
    return (
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {multiline ? (
          <textarea
            id={id}
            required
            rows={3}
            className={base}
            value={form[id]}
            onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          />
        ) : (
          <input
            id={id}
            required
            className={base}
            value={form[id]}
            onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          />
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  if (loadingMe) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-600">
        Loading checkout…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Checkout
      </h1>

      <form onSubmit={onSubmit} className="mt-10 space-y-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Your details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Used for this quotation and saved to your profile.
            </p>
            <div className="mt-6 space-y-4">
              {field("tradeName", "Trade Name")}
              {field("tinNumber", "TIN Number")}
              {field("vatNumber", "VAT Number")}
              {field("phone", "Phone")}
              {field("address", "Address", true)}
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Order summary</h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {items.map((row) => (
                <li
                  key={row.productId}
                  className="flex justify-between gap-4 py-3 text-sm"
                >
                  <span className="text-slate-700">
                    <span className="font-medium text-slate-900">
                      {row.name}
                    </span>
                    <span className="block text-slate-500">
                      {row.standardCode} × {row.quantity}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-slate-900">
                    {formatMoney(lineAmount(row.price, row.quantity))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold text-slate-900">
              <span>Total</span>
              <span>{formatMoney(subtotal.toFixed(2))}</span>
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="no-print w-full rounded-lg bg-[#2563EB] py-4 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Request Quotation"}
        </button>
      </form>
    </div>
  );
}
