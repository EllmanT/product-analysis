"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Banknote, CreditCard, Award, FileText, Smartphone } from "lucide-react";

type QuotationItem = {
  name: string;
  standardCode: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

type CheckoutPayMethod = "cod" | "card" | "ecocash";

type QuotationData = {
  _id: string;
  items: QuotationItem[];
  subtotal: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  checkoutPaymentMethod: CheckoutPayMethod | null;
  fulfillmentStatus: "pending" | "delivered" | null;
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

function quotationStatusLabel(status: string): string {
  if (status === "confirmed") return "Ready to pay";
  if (status === "pending") return "Quote issued";
  return status.charAt(0).toUpperCase() + status.slice(1);
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
      {quotationStatusLabel(status)}
    </span>
  );
}

type StepState = "done" | "active" | "upcoming";

function Timeline({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  function getStepState(stepIndex: number): StepState {
    if (status === "cancelled") {
      if (stepIndex === 0) return "done";
      return "upcoming";
    }
    if (status === "invoiced") {
      return "done";
    }
    if (paymentStatus === "paid") {
      if (stepIndex <= 1) return "done";
      if (stepIndex === 2) return "active";
      return "upcoming";
    }
    if (stepIndex === 0) return "done";
    if (stepIndex === 1) return "active";
    return "upcoming";
  }

  const steps = [
    { label: "Quote issued", icon: <FileText className="h-4 w-4" /> },
    { label: "Payment", icon: <CreditCard className="h-4 w-4" /> },
    { label: "Fiscal invoice", icon: <Award className="h-4 w-4" /> },
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
  onRefresh,
}: {
  quotation: QuotationData;
  onShareCopied: (msg: string) => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const refId = quotation._id.slice(-8).toUpperCase();
  const pdfUrl = `/api/shop/account/quotations/${quotation._id}/pdf`;
  const [selected, setSelected] = useState<CheckoutPayMethod | null>(
    quotation.checkoutPaymentMethod
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(quotation.checkoutPaymentMethod);
  }, [quotation.checkoutPaymentMethod, quotation._id]);

  const handleShare = async () => {
    const url = `${window.location.origin}/account/quotations/${quotation._id}`;
    try {
      await navigator.clipboard.writeText(url);
      onShareCopied("Link copied to clipboard!");
    } catch {
      prompt("Copy this link:", url);
    }
  };

  async function saveMethodAndContinue(method: CheckoutPayMethod) {
    setSaving(true);
    try {
      const res = await fetch(`/api/shop/quotations/${quotation._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ checkoutPaymentMethod: method }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        onShareCopied(json?.error?.message ?? "Could not save payment method");
        return;
      }
      onRefresh();
      if (method === "card") {
        router.push(
          `/payment/card?quotationId=${quotation._id}&amount=${encodeURIComponent(quotation.subtotal)}`
        );
      } else if (method === "ecocash") {
        router.push(`/payment/ecocash?quotationId=${quotation._id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const methodOptions: {
    key: CheckoutPayMethod;
    title: string;
    description: string;
    icon: ReactNode;
  }[] = [
    {
      key: "cod",
      title: "Cash on delivery",
      description: "Pay when you receive your order. Your fiscal invoice is issued after delivery is confirmed.",
      icon: <Banknote className="h-5 w-5" />,
    },
    {
      key: "card",
      title: "Card (Visa / Mastercard)",
      description: "Pay securely online with your card via our payment partner.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      key: "ecocash",
      title: "EcoCash",
      description: "Pay with EcoCash from your mobile wallet.",
      icon: <Smartphone className="h-5 w-5" />,
    },
  ];

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

  if (
    quotation.paymentStatus === "unpaid" &&
    (quotation.status === "confirmed" || quotation.status === "pending")
  ) {
    const method = quotation.checkoutPaymentMethod;

    if (method === "cod") {
      return (
        <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount Due</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#1E40AF]">
            {fmtMoney(quotation.subtotal)}
          </p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Cash on delivery</p>
            <p className="mt-2 text-sm text-slate-600">
              Pay when you receive your order. Your fiscal tax invoice will be issued after the delivery is confirmed by our team.
            </p>
            {quotation.fulfillmentStatus === "pending" ? (
              <p className="mt-3 text-xs font-medium text-amber-800">Delivery pending — invoice follows confirmation.</p>
            ) : null}
          </div>
          <a
            href={pdfUrl}
            download
            className="mt-4 block w-full rounded-[8px] border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Download Quotation PDF
          </a>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Share Link
          </button>
        </div>
      );
    }

    if (method === "card") {
      return (
        <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount Due</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#1E40AF]">
            {fmtMoney(quotation.subtotal)}
          </p>
          <p className="mt-2 text-sm text-slate-600">Card payment (Visa / Mastercard or ZimSwitch)</p>
          <Link
            href={`/payment/card?quotationId=${quotation._id}&amount=${encodeURIComponent(quotation.subtotal)}`}
            className="mt-4 block w-full rounded-[8px] bg-[#1E40AF] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
          >
            Continue to payment
          </Link>
          <a
            href={pdfUrl}
            download
            className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Download Quotation PDF
          </a>
        </div>
      );
    }

    if (method === "ecocash") {
      return (
        <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount Due</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#1E40AF]">
            {fmtMoney(quotation.subtotal)}
          </p>
          <p className="mt-2 text-sm text-slate-600">Complete payment with EcoCash</p>
          <Link
            href={`/payment/ecocash?quotationId=${quotation._id}`}
            className="mt-4 block w-full rounded-[8px] bg-[#1E40AF] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
          >
            Pay with EcoCash
          </Link>
          <a
            href={pdfUrl}
            download
            className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Download Quotation PDF
          </a>
        </div>
      );
    }

    return (
      <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount Due</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-[#1E40AF]">
          {fmtMoney(quotation.subtotal)}
        </p>
        <p className="mt-3 text-sm font-medium text-slate-800">How would you like to pay?</p>
        <div className="mt-3 space-y-2">
          {methodOptions.map((opt) => {
            const active = selected === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                className={`flex w-full gap-3 rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-[#1E40AF] bg-blue-50/80 ring-1 ring-[#1E40AF]"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="mt-0.5 shrink-0 text-[#1E40AF]">{opt.icon}</span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{opt.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{opt.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => selected && void saveMethodAndContinue(selected)}
          className="mt-4 w-full rounded-[8px] bg-[#1E40AF] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Please wait…" : "Continue"}
        </button>
        <a
          href={pdfUrl}
          download
          className="mt-2 block w-full rounded-[8px] border border-slate-200 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Download Quotation PDF
        </a>
        <p className="mt-3 text-center text-xs text-slate-500">Secure checkout</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <p className="text-sm text-slate-600">Ref: #{refId}</p>
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
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/shop/quotations/${id}`, { credentials: "include" });
      if (res.status === 401) { router.replace(`/login?redirect=/account/quotations/${id}`); return; }
      if (res.status === 404) { router.replace("/account/quotations"); return; }
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: { quotation: QuotationData; customer: CustomerData | null } };
        if (json.success && !cancelled) {
          setQuotation(json.data.quotation);
          setCustomer(json.data.customer);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router, refreshTick]);

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
              <ActionCard
                quotation={quotation}
                onShareCopied={showToast}
                onRefresh={() => setRefreshTick((t) => t + 1)}
              />
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
