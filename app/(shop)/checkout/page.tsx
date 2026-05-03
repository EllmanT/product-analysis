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
  buyerType: "individual" | "business";
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

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400/40";

const sectionLabelClass =
  "text-xs font-medium uppercase tracking-wider text-slate-500";

export default function CheckoutPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { items, clearCart } = useCart();
  const [loadingMe, setLoadingMe] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loadError, setLoadError] = useState(false);
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
    buyerType: "individual",
  });

  useEffect(() => {
    if (items.length === 0 && !showOverlay) {
      router.replace("/cart");
    }
  }, [items.length, router, showOverlay]);

  async function loadMe() {
    setLoadError(false);
    setLoadingMe(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const res = await fetch("/api/shop/customer/me", { credentials: "include" });
      if (res.status === 401) {
        setNeedsSignIn(true);
        setLoadingMe(false);
        return;
      }
      if (!res.ok) {
        setLoadError(true);
        setLoadingMe(false);
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
          buyerType: json.data.buyerType === "business" ? "business" : "individual",
        });
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMe(false);
    }
  }

  useEffect(() => {
    if (items.length === 0) {
      if (showOverlay) {
        setLoadingMe(false);
      }
      return;
    }
    void loadMe();
  }, [items.length, showOverlay]);

  const subtotal = items.reduce((sum, row) => {
    const n = parseFloat(lineAmount(row.price, row.quantity));
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  const isBusiness = form.buyerType === "business";

  async function handleSubmit() {
    setError(null);
    const el = formRef.current;
    if (el && !el.checkValidity()) {
      el.reportValidity();
      return;
    }
    if (isBusiness) {
      if (!form.tradeName.trim() || !form.tinNumber.trim() || !form.vatNumber.trim()) {
        setError("For a business account, company name, TIN, and VAT are required.");
        return;
      }
    }
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
      setNewQuotationId(id);
      setShowOverlay(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function field(
    id: keyof Omit<MeData, "buyerType">,
    label: string,
    opts?: { multiline?: boolean; required?: boolean }
  ) {
    const multiline = opts?.multiline;
    const required = opts?.required ?? true;
    return (
      <div>
        <label htmlFor={id} className={sectionLabelClass}>
          {label}
        </label>
        {multiline ? (
          <textarea
            id={id}
            required={required}
            rows={3}
            className={inputClass}
            value={form[id]}
            onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          />
        ) : (
          <input
            id={id}
            required={required}
            className={inputClass}
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
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600"
          aria-hidden
        />
        <p className="mt-4 text-sm text-slate-500">Loading checkout…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-700">
          We couldn&apos;t load your account details. This is usually a temporary network issue
          on our side.
        </p>
        <button
          type="button"
          onClick={() => void loadMe()}
          className="mt-4 rounded-md bg-[#1E40AF] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E3A8A]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (needsSignIn) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to confirm your order and get a quotation.
        </p>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Order summary
            </h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {items.map((row) => (
                <li
                  key={row.productId}
                  className="flex justify-between gap-3 py-3 first:pt-0 text-sm"
                >
                  <span className="min-w-0 text-slate-700">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {row.standardCode} × {row.quantity}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-slate-900">
                    {formatMoney(lineAmount(row.price, row.quantity))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(subtotal.toFixed(2))}</span>
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Sign in required</h2>
            <p className="mt-2 text-sm text-slate-600">
              To request a quotation and save your details, sign in to your customer account. If
              you don&apos;t have one yet, you can create one in a minute.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login?redirect=/checkout"
                className="inline-flex items-center justify-center rounded-md bg-[#1E40AF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1E3A8A]"
              >
                Sign in
              </Link>
              <Link
                href="/register?redirect=/checkout"
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                Create account
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Business tax details (TIN, VAT) are only needed if your account is set to business in
              settings or you choose that when you order.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Checkout</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review your order and the details we will use for your quotation
            {isBusiness ? " and tax invoice" : ""}.
          </p>
        </header>

        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(260px,22rem)_1fr] lg:items-start">
            <div className="order-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7 lg:order-1">
              <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Order summary
              </h2>
              <ul className="mt-4 divide-y divide-slate-100">
                {items.map((row) => (
                  <li
                    key={row.productId}
                    className="flex justify-between gap-3 py-3 first:pt-0 text-sm"
                  >
                    <span className="min-w-0 text-slate-700">
                      <span className="font-medium text-slate-900">{row.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {row.standardCode} × {row.quantity}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-900">
                      {formatMoney(lineAmount(row.price, row.quantity))}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-base font-semibold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(subtotal.toFixed(2))}</span>
              </div>

              {error ? (
                <p className="mt-4 text-left text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="no-print mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[#1E40AF] py-2.5 text-sm font-medium text-white transition hover:bg-[#1E3A8A] disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                    Submitting…
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
                    Confirm order &amp; get quotation
                  </>
                )}
              </button>
            </div>

            <div className="order-1 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8 lg:order-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Your details
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {isBusiness
                  ? "Company name, TIN, and VAT are used on formal quotations. Contact and address are required."
                  : "We use your name, phone, and address on this order. You can add a business profile in account settings if you need company details on documents."}
              </p>
              <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Account type:{" "}
                <span className="font-medium text-slate-800">
                  {isBusiness ? "Business" : "Individual"}
                </span>
                . Change it in{" "}
                <Link href="/account/settings" className="text-[#1E40AF] underline">
                  account settings
                </Link>{" "}
                if you need a different type.
              </div>
              <div className="mt-6 space-y-5">
                {isBusiness ? (
                  <>
                    {field("tradeName", "Company / trade name")}
                    {field("tinNumber", "TIN number")}
                    {field("vatNumber", "VAT number")}
                  </>
                ) : null}
                {field("phone", "Phone")}
                {field("address", "Address", { multiline: true })}
              </div>
            </div>
          </div>
        </form>
      </div>

      {showOverlay && newQuotationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
          <div
            className="w-full max-w-[400px] rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-success-title"
          >
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-8 w-8 text-emerald-600"
                  stroke="currentColor"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            </div>

            <h2
              id="checkout-success-title"
              className="mt-4 text-xl font-semibold tracking-tight text-slate-900"
            >
              Quotation submitted
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              We&apos;ve received your order and will confirm it shortly. You&apos;ll be notified by
              email.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => router.push(`/account/quotations/${newQuotationId}`)}
                className="rounded-md bg-[#1E40AF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1E3A8A] sm:flex-1"
              >
                View quotation
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOverlay(false);
                  router.push("/");
                }}
                className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 sm:flex-1"
              >
                Continue shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
