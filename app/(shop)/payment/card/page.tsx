// TODO: Replace this entire component with the ZimSwitch payment SDK integration. Contact payments team for credentials and SDK documentation.

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { Lock } from "lucide-react";

function formatCardInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(" ");
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function CardPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";
  const amount = searchParams.get("amount") ?? "0.00";

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);

  const displayAmount = (() => {
    const n = parseFloat(amount);
    if (Number.isNaN(n)) return "$0.00";
    return `$${n.toFixed(2)}`;
  })();

  const pay = useCallback(async () => {
    if (!quotationId) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 2000));
    setBusy(false);
    router.push(`/payment/success?quotationId=${quotationId}`);
  }, [quotationId, router]);

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
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
        Test Mode — No real payments will be processed
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Secure card payment
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {/* Placeholder: production will load the ZimSwitch widget here */}
            Card details are not stored or transmitted in this demo.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="cardNumber"
              className="text-sm font-medium text-slate-700"
            >
              Card number
            </label>
            <input
              id="cardNumber"
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-slate-900 outline-none ring-[#2563EB] focus:ring-2"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardInput(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="expiry"
                className="text-sm font-medium text-slate-700"
              >
                Expiry (MM/YY)
              </label>
              <input
                id="expiry"
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="12/28"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-slate-900 outline-none ring-[#2563EB] focus:ring-2"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="cvv" className="text-sm font-medium text-slate-700">
                CVV
              </label>
              <input
                id="cvv"
                type="password"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                maxLength={4}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-slate-900 outline-none ring-[#2563EB] focus:ring-2"
                value={cvv}
                onChange={(e) =>
                  setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void pay()}
          className="mt-8 flex w-full items-center justify-center rounded-lg bg-[#2563EB] py-3.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-70"
        >
          {busy ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            `Pay ${displayAmount}`
          )}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          {/* Placeholder: tokenize card with PSP before charging */}
          Demo only — submit any test values.
        </p>
      </div>
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
