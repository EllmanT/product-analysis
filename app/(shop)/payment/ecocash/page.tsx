// TODO: Replace this entire component with the EcoCash API integration. Contact payments team for merchant credentials and API documentation.

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { Smartphone } from "lucide-react";

function formatZwMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6)
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function EcoCashPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";

  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const sendRequest = useCallback(async () => {
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
            <Smartphone className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            EcoCash payment
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {/* Placeholder: production will call EcoCash STK / merchant API here */}
            Enter the number that receives the EcoCash prompt.
          </p>
        </div>

        <div className="mt-8">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700">
            Mobile number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="077 123 4567"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-lg tracking-wide text-slate-900 outline-none ring-[#2563EB] focus:ring-2"
            value={phone}
            onChange={(e) => setPhone(formatZwMobile(e.target.value))}
          />
          <p className="mt-2 text-xs text-slate-500">
            Zimbabwe format: 07X XXX XXXX
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void sendRequest()}
          className="mt-8 flex w-full items-center justify-center rounded-lg bg-[#2563EB] py-3.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-70"
        >
          {busy ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Send Payment Request"
          )}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          {/* Placeholder: poll payment status or handle webhook */}
          Demo only — no SMS or push is sent.
        </p>
      </div>
    </div>
  );
}

export default function EcoCashPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-600">
          Loading…
        </div>
      }
    >
      <EcoCashPaymentContent />
    </Suspense>
  );
}
