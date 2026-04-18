// LIVE INTEGRATION: Calls EcoCash Holdings debit push API. Requires merchant credentials in .env

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { CheckCircle, Smartphone, XCircle } from "lucide-react";

function formatZwMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

type Phase = "form" | "waiting" | "success" | "failed";

function EcoCashPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";

  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ZWG">("USD");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [phase, setPhase] = useState<Phase>("form");
  const [referenceCode, setReferenceCode] = useState("");
  const [localAmount, setLocalAmount] = useState<number | null>(null);
  const [localCurrency, setLocalCurrency] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (refCode: string) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/payments/ecocash/status/${encodeURIComponent(refCode)}`,
            { credentials: "include" }
          );
          if (!res.ok) return;
          const body = (await res.json()) as { status?: string; completedAt?: string };
          if (body.status === "completed") {
            stopPolling();
            setPhase("success");
            setTimeout(() => {
              router.push(`/payment/success?quotationId=${quotationId}`);
            }, 2000);
          } else if (body.status === "failed") {
            stopPolling();
            setPhase("failed");
          }
        } catch {
          // ignore transient poll errors
        }
      }, 5000);

      // Timeout after 3 minutes
      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) {
          stopPolling();
          setPhase("waiting"); // remain on waiting but timeout message visible
        }
      }, 180_000);
    },
    [quotationId, router, stopPolling]
  );

  const sendRequest = useCallback(async () => {
    if (!quotationId || !phone) return;
    setErrorMsg("");
    setBusy(true);

    try {
      const res = await fetch("/api/payments/ecocash/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quotationId,
          phoneNumber: phone.replace(/\s/g, ""),
          currency,
        }),
      });

      const body = (await res.json()) as {
        referenceCode?: string;
        localAmount?: number;
        localCurrency?: string;
        error?: { message?: string };
        message?: string;
      };

      if (!res.ok) {
        setErrorMsg(
          body?.error?.message ?? body?.message ?? "Failed to send payment request. Please try again."
        );
        return;
      }

      setReferenceCode(body.referenceCode ?? "");
      setLocalAmount(body.localAmount ?? null);
      setLocalCurrency(body.localCurrency ?? currency);
      setPhase("waiting");
      startPolling(body.referenceCode ?? "");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [quotationId, phone, currency, startPolling]);

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

  // ── Success state ──────────────────────────────────────────────
  if (phase === "success") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm text-center">
          <CheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Payment confirmed!</h1>
          <p className="mt-2 text-sm text-slate-500">Redirecting you to your receipt…</p>
        </div>
      </div>
    );
  }

  // ── Failed state ───────────────────────────────────────────────
  if (phase === "failed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm text-center">
          <XCircle className="mx-auto h-14 w-14 text-red-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Payment failed</h1>
          <p className="mt-2 text-sm text-slate-500">
            The EcoCash payment was not completed. You can try again below.
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("form");
              setReferenceCode("");
            }}
            className="mt-6 rounded-lg bg-[#2563EB] px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Waiting state ──────────────────────────────────────────────
  if (phase === "waiting") {
    const timedOut = !pollRef.current && referenceCode !== "";
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <Smartphone className="h-7 w-7 text-blue-600" aria-hidden />
              {!timedOut && (
                <span className="absolute inset-0 animate-ping rounded-full bg-blue-200 opacity-50" />
              )}
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              Waiting for payment
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              A payment request has been sent to{" "}
              <span className="font-semibold">{phone}</span>. Please check your
              phone and enter your EcoCash PIN to complete the payment.
            </p>
            <p className="mt-3 font-mono text-xs text-slate-400">
              Ref: {referenceCode}
            </p>
            {localAmount !== null && (
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {localCurrency} {localAmount.toFixed(2)}
              </p>
            )}
          </div>

          {timedOut ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              Payment is taking longer than expected. You can close this page and
              check your quotation status in your dashboard.
            </div>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Checking payment status every 5 seconds…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Smartphone className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Pay with EcoCash</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your EcoCash number to receive a payment prompt.
          </p>
        </div>

        {/* Currency selector */}
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-700">Currency</p>
          <div className="mt-2 flex gap-3">
            {(["USD", "ZWG"] as const).map((c) => (
              <label
                key={c}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                  currency === c
                    ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="currency"
                  value={c}
                  checked={currency === c}
                  onChange={() => setCurrency(c)}
                  className="sr-only"
                />
                {c}
              </label>
            ))}
          </div>
        </div>

        {/* Phone number */}
        <div className="mt-5">
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
          <p className="mt-1 text-xs text-slate-400">Zimbabwe format: 07X XXX XXXX</p>
        </div>

        {errorMsg && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          disabled={busy || !phone}
          onClick={() => void sendRequest()}
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-[#2563EB] py-3.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {busy ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Send Payment Request"
          )}
        </button>
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
