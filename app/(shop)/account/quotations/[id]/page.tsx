"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, CheckSquare, CreditCard, Award, FileText } from "lucide-react";

type QuotationItem = {
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type QuotationData = {
  _id: string;
  items: QuotationItem[];
  subtotal: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
};

type CustomerData = {
  firstName: string;
  lastName: string;
  tradeName: string;
  email: string;
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtMoney(s: string): string {
  const n = parseFloat(s);
  return `$${isNaN(n) ? "0.00" : n.toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-blue-100 text-blue-800",
    confirmed: "bg-amber-100 text-amber-800",
    invoiced: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center rounded-[6px] px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Timeline step helper ──────────────────────────────────────
type StepState = "done" | "active" | "upcoming";

function TimelineStep({
  icon,
  label,
  state,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  state: StepState;
  isLast: boolean;
}) {
  const circleClass =
    state === "done"
      ? "bg-emerald-500 text-white"
      : state === "active"
      ? "bg-[#1E40AF] text-white ring-4 ring-blue-100"
      : "bg-slate-100 text-slate-400";

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${circleClass} transition-all`}>
        {icon}
      </div>
      <p className={`mt-2 text-center text-xs font-medium ${state === "upcoming" ? "text-slate-400" : "text-slate-700"}`}>
        {label}
      </p>
      {!isLast && (
        <div className="absolute top-5 left-full h-0.5 w-full -translate-y-1/2 bg-slate-200" />
      )}
    </div>
  );
}

function Timeline({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  function getStepState(stepIndex: number): StepState {
    // 0=Submitted, 1=Confirmed, 2=Payment, 3=Invoice
    let activeStep = 0;
    if (status === "confirmed" && paymentStatus === "unpaid") activeStep = 1;
    else if (paymentStatus === "paid") activeStep = 2;
    if (status === "invoiced") activeStep = 3;

    if (stepIndex < activeStep) return "done";
    if (stepIndex === activeStep) return "active";
    return "upcoming";
  }

  const steps = [
    { label: "Quotation Submitted", icon: <FileText className="h-4 w-4" /> },
    { label: "Confirmed", icon: <CheckSquare className="h-4 w-4" /> },
    { label: "Payment Received", icon: <CreditCard className="h-4 w-4" /> },
    { label: "Invoice Issued", icon: <Award className="h-4 w-4" /> },
  ];

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Order Progress</h3>
      <div className="relative flex justify-between">
        {/* Connector line */}
        <div className="absolute left-0 right-0 top-5 h-0.5 bg-slate-200" />
        {steps.map((step, i) => (
          <div key={i} className="relative z-10 flex flex-1 flex-col items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                getStepState(i) === "done"
                  ? "bg-emerald-500 text-white"
                  : getStepState(i) === "active"
                  ? "bg-[#1E40AF] text-white ring-4 ring-blue-100"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {step.icon}
            </div>
            <p
              className={`mt-2 text-center text-xs font-medium ${
                getStepState(i) === "upcoming" ? "text-slate-400" : "text-slate-700"
              }`}
            >
              {step.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action card ───────────────────────────────────────────────
function ActionCard({
  quotation,
  onShareCopied,
}: {
  quotation: QuotationData;
  onShareCopied: (msg: string) => void;
}) {
  const refId = quotation._id.slice(-8).toUpperCase();
  const pdfUrl = `/api/shop/account/quotations/${quotation._id}/pdf`;

  const handleShare = async () => {
    const url = `${window.location.origin}/account/quotations/${quotation._id}`;
    try {
      await navigator.clipboard.writeText(url);
      onShareCopied("Link copied to clipboard!");
    } catch {
      prompt("Copy this link:", url);
    }
  };

  if (quotation.status === "cancelled") {
    return (
      <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4">
          <span className="text-lg">⚠️</span>
          <p className="text-sm text-red-700">This quotation was cancelled.</p>
        </div>
        <a href="mailto:support@stockflow.com" className="mt-4 block text-center text-sm text-[#1E40AF] hover:underline">
          Contact support
        </a>
      </div>
    );
  }

  if (quotation.paymentStatus === "paid") {
    return (
      <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
          <span className="text-2xl">✓</span>
          <div>
            <p className="font-semibold text-green-800">Order Complete</p>
            <p className="text-xs text-green-600">Payment received</p>
          </div>
        </div>
        <Link
          href="/account/invoices"
          className="mt-4 block w-full rounded-[8px] bg-[#059669] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#047857]"
        >
          View Invoice
        </Link>
        <button
          onClick={handleShare}
          className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Share Link
        </button>
      </div>
    );
  }

  if (quotation.status === "confirmed" && quotation.paymentStatus === "unpaid") {
    return (
      <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount Due</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#1E40AF]">
          {fmtMoney(quotation.subtotal)}
        </p>
        <Link
          href={`/payment/card?quotationId=${quotation._id}&amount=${quotation.subtotal}`}
          className="mt-4 block w-full rounded-[8px] bg-[#1E40AF] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
        >
          Pay Now
        </Link>
        <a
          href={pdfUrl}
          download
          className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Download Quotation PDF
        </a>
        <p className="mt-3 text-center text-xs text-slate-500">Secure payment processed by StockFlow</p>
      </div>
    );
  }

  // Pending
  return (
    <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Awaiting confirmation from our team. You'll be notified by email when your quotation is confirmed.
        </p>
      </div>
      <a
        href={pdfUrl}
        download
        className="mt-4 block w-full rounded-[8px] border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Download Quotation PDF
      </a>
      <button
        onClick={handleShare}
        className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Share Link
      </button>
      <p className="mt-3 text-center text-xs text-slate-500">Ref: #{refId}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function QuotationDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<QuotationData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/shop/quotations/${id}`, { credentials: "include" });
      if (res.status === 401) { router.replace(`/login?redirect=/account/quotations/${id}`); return; }
      if (res.status === 404) { router.replace("/account/quotations"); return; }
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: { quotation: QuotationData; customer: CustomerData | null } };
        if (json.success) {
          setQuotation(json.data.quotation);
          setCustomer(json.data.customer);
        }
      }
      setLoading(false);
    })();
  }, [id, router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-500">
        Loading…
      </div>
    );
  }

  if (!quotation) return null;

  const refId = quotation._id.slice(-8).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <nav className="mb-2 text-sm text-[#6B7280]">
          <Link href="/account" className="hover:text-[#1E40AF]">Dashboard</Link>
          <span className="mx-2">/</span>
          <Link href="/account/quotations" className="hover:text-[#1E40AF]">Quotations</Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">#{refId}</span>
        </nav>

        <div className="mt-4 grid gap-6 lg:grid-cols-3">

          {/* Left column */}
          <div className="space-y-6 lg:col-span-2">

            {/* Items card */}
            <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="font-shop-display text-lg font-semibold tracking-tight text-slate-900">
                    Quotation #{refId}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">{fmtDate(quotation.createdAt)}</p>
                </div>
                <StatusBadge status={quotation.status} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Product</th>
                      <th className="px-6 py-3">SKU</th>
                      <th className="px-6 py-3 text-center">Qty</th>
                      <th className="px-6 py-3 text-right">Unit Price</th>
                      <th className="px-6 py-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotation.items.map((item, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-6 py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="px-6 py-3 font-mono text-xs text-slate-500">{item.standardCode}</td>
                        <td className="px-6 py-3 text-center text-slate-700">{item.quantity}</td>
                        <td className="px-6 py-3 text-right text-slate-700">{fmtMoney(item.unitPrice)}</td>
                        <td className="px-6 py-3 text-right font-semibold text-slate-900">{fmtMoney(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-100 px-6 py-4">
                <div className="ml-auto w-fit space-y-1">
                  <div className="flex justify-between gap-12 text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-medium text-slate-900">{fmtMoney(quotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-12 border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                    <span>Total</span>
                    <span style={{ color: "#1E40AF" }}>{fmtMoney(quotation.subtotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <Timeline status={quotation.status} paymentStatus={quotation.paymentStatus} />
          </div>

          {/* Right column — sticky action card */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <ActionCard quotation={quotation} onShareCopied={showToast} />
              {customer && (
                <div className="mt-4 rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Info</h3>
                  <p className="text-sm font-semibold text-slate-900">{customer.firstName} {customer.lastName}</p>
                  <p className="text-xs text-slate-500">{customer.tradeName}</p>
                  <p className="mt-1 text-xs text-slate-500">{customer.email}</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
