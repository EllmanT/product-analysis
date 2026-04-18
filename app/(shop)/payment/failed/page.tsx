"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { XCircle } from "lucide-react";

function PaymentFailedContent() {
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-red-50 px-4 py-16">
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-12 text-center shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-10 w-10 text-red-500" aria-hidden />
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-slate-900">Payment Failed</h1>
        <p className="mt-3 text-slate-600">
          Your payment could not be processed. Please try again or choose a different payment method.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {quotationId && (
            <Link
              href={`/payment/card?quotationId=${encodeURIComponent(quotationId)}`}
              className="inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
            >
              Try Again
            </Link>
          )}
          {quotationId && (
            <Link
              href={`/account/quotations/${quotationId}`}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View Quotation
            </Link>
          )}
          {!quotationId && (
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
            >
              Continue Shopping
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-600">
          Loading…
        </div>
      }
    >
      <PaymentFailedContent />
    </Suspense>
  );
}
