// LIVE INTEGRATION: OPPWA Copy & Pay widget. Requires ZimSwitch credentials in .env

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";

type PaymentOption = "visa_master_usd" | "zimswitch_usd" | "zimswitch_zig";

interface OptionConfig {
  key: PaymentOption;
  label: string;
  sub: string;
  brands: string[];
}

const PAYMENT_OPTIONS: OptionConfig[] = [
  {
    key: "visa_master_usd",
    label: "Visa / Mastercard",
    sub: "USD",
    brands: ["VISA", "MASTER"],
  },
  {
    key: "zimswitch_usd",
    label: "ZimSwitch",
    sub: "USD",
    brands: ["ZIMSWITCH"],
  },
  {
    key: "zimswitch_zig",
    label: "ZimSwitch",
    sub: "ZIG",
    brands: ["ZIMSWITCH"],
  },
];

function CardPaymentContent() {
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";

  const [selected, setSelected] = useState<PaymentOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [dataBrands, setDataBrands] = useState<string>("VISA MASTER");
  const [baseUrl, setBaseUrl] = useState<string>("https://eu-prod.oppwa.com");
  const [scriptReady, setScriptReady] = useState(false);

  const returnUrl = `/api/payments/zimswitch/return?quotationId=${encodeURIComponent(quotationId)}`;

  async function proceed() {
    if (!selected || !quotationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/zimswitch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId, paymentOption: selected }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: { message?: string };
        checkoutId?: string;
        dataBrands?: string;
        baseUrl?: string;
      };
      if (!res.ok || !data.checkoutId) {
        throw new Error(data.error?.message ?? "Failed to create checkout session");
      }
      setCheckoutId(data.checkoutId);
      setDataBrands(data.dataBrands ?? "VISA MASTER");
      setBaseUrl(data.baseUrl ?? "https://eu-prod.oppwa.com");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!checkoutId) return;
    setScriptReady(false);
    const script = document.createElement("script");
    script.src = `${baseUrl}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(checkoutId)}`;
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError("Failed to load payment widget. Please try again.");
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [checkoutId, baseUrl]);

  if (!quotationId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-600">Missing quotation reference.</p>
        <Link href="/cart" className="mt-4 inline-block text-[#2563EB]">
          Back to cart
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <ShieldCheck className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Secure card payment</h1>
          <p className="mt-1 text-sm text-slate-500">
            Select your preferred payment method to continue.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!checkoutId && (
          <div className="mt-8 space-y-3">
            <p className="text-sm font-medium text-slate-700">Choose payment method</p>
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                  selected === opt.key
                    ? "border-[#2563EB] bg-blue-50 ring-1 ring-[#2563EB]"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <CreditCard className="h-5 w-5 text-slate-600" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.sub} &middot; {opt.brands.join(", ")}</p>
                </div>
              </button>
            ))}

            <button
              type="button"
              disabled={!selected || loading}
              onClick={() => void proceed()}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-[#2563EB] py-3.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Proceed to payment"
              )}
            </button>
          </div>
        )}

        {checkoutId && !scriptReady && !error && (
          <div className="mt-8 flex justify-center">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
          </div>
        )}

        {checkoutId && (
          <div className="mt-8">
            <form
              action={returnUrl}
              className="paymentWidgets"
              data-brands={dataBrands}
            />
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Payments are processed securely via OPPWA / ZimSwitch.
      </p>
    </div>
  );
}

export default function CardPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-600">
          Loading…
        </div>
      }
    >
      <CardPaymentContent />
    </Suspense>
  );
}
