"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const formRef = useRef<HTMLFormElement>(null);
  const { items, clearCart } = useCart();
  const [loadingMe, setLoadingMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newQuotationId, setNewQuotationId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [form, setForm] = useState<MeData>({
    tradeName: "",
    tinNumber: "",
    vatNumber: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    if (items.length === 0 && !showOverlay) {
      router.replace("/cart");
    }
  }, [items.length, router, showOverlay]);

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
      const json = (await res.json()) as { success: boolean; data: MeData };
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
    return () => { cancelled = true; };
  }, [router]);

  const subtotal = items.reduce((sum, row) => {
    const n = parseFloat(lineAmount(row.price, row.quantity));
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  async function handleSubmit() {
    setError(null);
    const el = formRef.current;
    if (el && !el.checkValidity()) { el.reportValidity(); return; }
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
      if (!res.ok) { setError(json?.error?.message ?? "Request failed"); return; }
      const id = json?.data?._id as string | undefined;
      if (!id) { setError("Invalid response from server"); return; }
      clearCart();
      setNewQuotationId(id);
      setShowOverlay(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function field(id: keyof MeData, label: string, multiline?: boolean) {
    const base =
      "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 outline-none ring-[#2563EB] focus:ring-2";
    return (
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
        {multiline ? (
          <textarea
            id={id} required rows={3} className={base}
            value={form[id]}
            onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          />
        ) : (
          <input
            id={id} required className={base}
            value={form[id]}
            onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          />
        )}
      </div>
    );
  }

  if (!showOverlay && items.length === 0) return null;

  if (loadingMe) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-600">
        Loading checkout…
      </div>
    );
  }

  return (
    <>
      {/* ── Main checkout page ── */}
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Checkout
        </h1>

        <div className="mt-10 space-y-8">
          <form ref={formRef} className="grid gap-8 lg:grid-cols-2">
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
                  <li key={row.productId} className="flex justify-between gap-4 py-3 text-sm">
                    <span className="text-slate-700">
                      <span className="font-medium text-slate-900">{row.name}</span>
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
          </form>

          {error ? (
            <p className="text-center text-sm text-red-600" role="alert">{error}</p>
          ) : null}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="no-print flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#1E40AF] py-[14px] text-base font-semibold text-white transition hover:bg-[#1E3A8A] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Submitting…
              </>
            ) : (
              <>
                <ShoppingBag className="h-5 w-5" />
                Confirm Order &amp; Get Quotation
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Success overlay ── */}
      {showOverlay && newQuotationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[440px] rounded-2xl bg-white p-10 text-center shadow-2xl">
            {/* Green checkmark */}
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#10B981]/10">
                <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-[#10B981]" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            </div>

            <h2 className="mt-5 text-2xl font-bold text-slate-900">Quotation Submitted!</h2>
            <p className="mt-3 text-sm text-slate-500">
              We&apos;ve received your order and will confirm it shortly. You&apos;ll be notified by email.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => router.push(`/account/quotations/${newQuotationId}`)}
                className="flex-1 rounded-[8px] bg-[#1E40AF] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
              >
                View My Quotation
              </button>
              <button
                onClick={() => { setShowOverlay(false); router.push("/"); }}
                className="flex-1 rounded-[8px] border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
