"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { CheckCircle2 } from "lucide-react";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";
  const [patchError, setPatchError] = useState<string | null>(null);

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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quotationId]);

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
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="flex justify-center">
        <CheckCircle2
          className="h-20 w-20 text-emerald-500"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">
        Payment Received!
      </h1>
      <p className="mt-3 text-slate-600">
        Your order reference is{" "}
        <span className="font-mono font-semibold text-slate-900">
          {quotationId}
        </span>
        . You will receive your quotation confirmation shortly.
      </p>
      {patchError ? (
        <p className="mt-4 text-sm text-amber-800" role="status">
          {patchError}
        </p>
      ) : null}
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href={`/quotations/${quotationId}`}
          className="inline-flex justify-center rounded-lg bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600"
        >
          View My Quotation
        </Link>
        <Link
          href="/"
          className="inline-flex justify-center rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Continue Shopping
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
