"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Clock,
  CheckCircle,
  FileText,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
type Summary = {
  totalOrders: number;
  pendingQuotations: number;
  completedOrders: number;
  totalInvoices: number;
  customer: {
    firstName: string;
    lastName: string;
    tradeName: string;
    memberSince: string;
  } | null;
};

type QuotationRow = {
  _id: string;
  referenceId: string;
  createdAt: string;
  items: unknown[];
  total: string;
  status: string;
  paymentStatus: string;
};

type InvoiceRow = {
  _id: string;
  invoiceNumber: string;
  createdAt: string;
  total: string;
  status: string;
};

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtMoney(s: string): string {
  const n = parseFloat(s);
  return `$${isNaN(n) ? "0.00" : n.toFixed(2)}`;
}

function fmtMemberSince(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ── Badge components ──────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-blue-100 text-blue-800",
    confirmed: "bg-amber-100 text-amber-800",
    invoiced: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-flex items-center rounded-[6px] px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function PayBadge({ status }: { status: string }) {
  return status === "paid" ? (
    <span className="inline-flex items-center rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
      Paid
    </span>
  ) : (
    <span className="inline-flex items-center rounded-[6px] bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      Unpaid
    </span>
  );
}

// ── Skeleton card ─────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-16 rounded bg-slate-200" />
          <div className="h-3 w-28 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
type StatCardProps = {
  icon: React.ReactNode;
  value: number;
  label: string;
  iconBg: string;
};

function StatCard({ icon, value, label, iconBg }: StatCardProps) {
  return (
    <div className="group flex items-center gap-4 rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: "2.2rem", fontWeight: 700, lineHeight: 1, color: "#111827" }}>
          {value}
        </p>
        <p className="mt-1 text-sm text-[#6B7280]">{label}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingQ, setLoadingQ] = useState(true);
  const [loadingI, setLoadingI] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/shop/dashboard/summary", { credentials: "include" });
      if (res.status === 401) { router.replace("/login?redirect=/account"); return; }
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: Summary };
        if (json.success) setSummary(json.data);
      }
      setLoadingSummary(false);
    })();

    (async () => {
      const res = await fetch("/api/shop/account/quotations?limit=5", { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: { quotations: QuotationRow[] } };
        if (json.success) setQuotations(json.data.quotations);
      }
      setLoadingQ(false);
    })();

    (async () => {
      const res = await fetch("/api/shop/account/invoices?limit=5", { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as { success: boolean; data: { invoices: InvoiceRow[] } };
        if (json.success) setInvoices(json.data.invoices);
      }
      setLoadingI(false);
    })();
  }, [router]);

  const c = summary?.customer;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Welcome bar */}
        <div className="mb-8">
          <h1
            style={{ fontFamily: "'Syne', sans-serif", fontSize: "2rem", fontWeight: 700, color: "#111827" }}
          >
            Welcome back, {c?.firstName ?? "…"}!
          </h1>
          <p className="mt-1 text-[0.95rem] text-[#6B7280]">
            {c?.tradeName ?? ""}
            {c?.memberSince ? ` · Member since ${fmtMemberSince(c.memberSince)}` : ""}
          </p>
          <hr className="mt-6 border-slate-200" />
        </div>

        {/* Stats row */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                icon={<ShoppingBag className="h-5 w-5 text-blue-600" />}
                value={summary?.totalOrders ?? 0}
                label="Total Orders"
                iconBg="bg-blue-50"
              />
              <StatCard
                icon={<Clock className="h-5 w-5 text-amber-600" />}
                value={summary?.pendingQuotations ?? 0}
                label="Pending Quotations"
                iconBg="bg-amber-50"
              />
              <StatCard
                icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
                value={summary?.completedOrders ?? 0}
                label="Completed Orders"
                iconBg="bg-emerald-50"
              />
              <StatCard
                icon={<FileText className="h-5 w-5 text-purple-600" />}
                value={summary?.totalInvoices ?? 0}
                label="Total Invoices"
                iconBg="bg-purple-50"
              />
            </>
          )}
        </div>

        {/* Recent Quotations */}
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>
              Recent Quotations
            </h2>
            <Link href="/account/quotations" className="text-sm font-medium text-[#1E40AF] hover:underline">
              View All →
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
            {loadingQ ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500">Loading…</div>
            ) : quotations.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No quotations yet.</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Reference</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Items</th>
                        <th className="px-5 py-3">Total</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Payment</th>
                        <th className="px-5 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotations.map((q) => (
                        <tr key={q._id} className="border-b border-slate-100 last:border-0 hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-5 py-3 font-mono text-xs text-slate-700">#{q.referenceId}</td>
                          <td className="px-5 py-3 text-slate-600">{fmtDate(q.createdAt)}</td>
                          <td className="px-5 py-3 text-slate-600">{q.items.length} item{q.items.length !== 1 ? "s" : ""}</td>
                          <td className="px-5 py-3 font-semibold text-slate-900">{fmtMoney(q.total)}</td>
                          <td className="px-5 py-3"><StatusBadge status={q.status} /></td>
                          <td className="px-5 py-3"><PayBadge status={q.paymentStatus} /></td>
                          <td className="px-5 py-3">
                            {q.status === "confirmed" && q.paymentStatus === "unpaid" ? (
                              <Link
                                href={`/payment/card?quotationId=${q._id}&amount=${q.total}`}
                                className="rounded-[8px] bg-[#1E40AF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
                              >
                                Pay Now
                              </Link>
                            ) : (
                              <Link
                                href={`/account/quotations/${q._id}`}
                                className="rounded-[8px] border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                View
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile stacked cards */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {quotations.map((q) => (
                    <div key={q._id} className="px-4 py-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-700">#{q.referenceId}</span>
                        <span className="text-xs text-slate-500">{fmtDate(q.createdAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                        <span>{q.items.length} item{q.items.length !== 1 ? "s" : ""}</span>
                        <span>·</span>
                        <span className="font-semibold text-slate-900">{fmtMoney(q.total)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={q.status} />
                        <PayBadge status={q.paymentStatus} />
                        {q.status === "confirmed" && q.paymentStatus === "unpaid" ? (
                          <Link href={`/payment/card?quotationId=${q._id}&amount=${q.total}`} className="ml-auto rounded-[8px] bg-[#1E40AF] px-3 py-1 text-xs font-semibold text-white">Pay Now</Link>
                        ) : (
                          <Link href={`/account/quotations/${q._id}`} className="ml-auto rounded-[8px] border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">View</Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recent Invoices */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>
              My Invoices
            </h2>
            <Link href="/account/invoices" className="text-sm font-medium text-[#1E40AF] hover:underline">
              View All →
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
            {loadingI ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500">Loading…</div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No invoices yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Invoice #</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv._id} className="border-b border-slate-100 last:border-0 hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                        <td className="px-5 py-3 text-slate-600">{fmtDate(inv.createdAt)}</td>
                        <td className="px-5 py-3 font-semibold text-slate-900">{fmtMoney(inv.total)}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Paid</span>
                        </td>
                        <td className="px-5 py-3">
                          <Link
                            href={`/account/invoices/${inv._id}`}
                            target="_blank"
                            className="rounded-[8px] border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Download
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
