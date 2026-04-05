"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";
  const [patchError, setPatchError] = useState<string | null>(null);
  const [patched, setPatched] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const redirected = useRef(false);

  // Mark quotation as paid
  useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/shop/quotations/${quotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentStatus: "paid" }),
      });
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setPatchError(
          (j as { error?: { message?: string } })?.error?.message ??
            "Could not update payment status."
        );
      } else {
        setPatched(true);
      }
    })();
    return () => { cancelled = true; };
  }, [quotationId]);

  // Countdown + auto-redirect after 3 seconds
  useEffect(() => {
    if (!quotationId) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          if (!redirected.current) {
            redirected.current = true;
            router.push(`/account/quotations/${quotationId}`);
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [quotationId, router]);

  if (!quotationId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-600">Missing order reference.</p>
        <Link href="/" className="mt-4 inline-block text-[#2563EB]">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#F0FDF4] px-4 py-16">
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-12 text-center shadow-[0_4px_24px_rgba(0,0,0,0.08)]">

        {/* Animated checkmark */}
        <div className="flex justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#10B981]/10"
            style={{ animation: "checkPop 0.4s ease forwards" }}
          >
            <svg
              viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-[#10B981]"
              stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>

        <style>{`
          @keyframes checkPop {
            0% { transform: scale(0); }
            70% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}</style>

        <h1 className="mt-6 text-2xl font-bold text-slate-900">Payment Successful!</h1>
        <p className="mt-3 text-slate-600">
          Your payment has been received. We&apos;re generating your invoice now.
        </p>

        {patchError ? (
          <p className="mt-4 text-sm text-amber-700" role="status">{patchError}</p>
        ) : patched ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-[6px] bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-800">
            ✓ Order Updated
          </div>
        ) : null}

        {/* Countdown */}
        <p className="mt-6 text-sm text-slate-400">
          {countdown > 0
            ? `Redirecting to your order in ${countdown} second${countdown !== 1 ? "s" : ""}…`
            : "Redirecting…"}
        </p>

        {/* Progress bar */}
        <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#1E40AF] transition-all"
            style={{ width: `${((3 - countdown) / 3) * 100}%`, transition: "width 1s linear" }}
          />
        </div>

        <Link
          href={`/account/quotations/${quotationId}`}
          className="mt-8 inline-flex items-center justify-center rounded-[8px] bg-[#1E40AF] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
        >
          Go to My Order
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-600">
          Loading…
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
