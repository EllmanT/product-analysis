"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type QuotationRow = {
  _id: string;
  referenceId: string;
  createdAt: string;
  items: unknown[];
  total: string;
  status: string;
  paymentStatus: string;
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
  const cls = map[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-[6px] px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function PayBadge({ status }: { status: string }) {
  return status === "paid" ? (
    <span className="inline-flex items-center rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Paid</span>
  ) : (
    <span className="inline-flex items-center rounded-[6px] bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Unpaid</span>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending Payment" },
  { key: "completed", label: "Completed" },
] as const;

type FilterKey = typeof FILTERS[number]["key"];

function QuotationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = (searchParams.get("filter") ?? "all") as FilterKey;
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const [rows, setRows] = useState<QuotationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const LIMIT = 10;

  useEffect(() => {
    setLoading(true);
    (async () => {
      const res = await fetch(
        `/api/shop/account/quotations?filter=${filter}&page=${pageParam}&limit=${LIMIT}`,
        { credentials: "include" }
      );
      if (res.status === 401) { router.replace("/login?redirect=/account/quotations"); return; }
      if (res.ok) {
        const json = await res.json() as {
          success: boolean;
          data: { quotations: QuotationRow[]; total: number; page: number; totalPages: number };
        };
        if (json.success) {
          setRows(json.data.quotations);
          setTotal(json.data.total);
          setTotalPages(json.data.totalPages);
        }
      }
      setLoading(false);
    })();
  }, [filter, pageParam, router]);

  function setFilter(f: FilterKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", f);
    params.set("page", "1");
    router.push(`/account/quotations?${params.toString()}`);
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/account/quotations?${params.toString()}`);
  }

  const start = (pageParam - 1) * LIMIT + 1;
  const end = Math.min(pageParam * LIMIT, total);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <nav className="mb-2 text-sm text-[#6B7280]">
          <Link href="/account" className="hover:text-[#1E40AF]">Dashboard</Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">Quotations</span>
        </nav>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "#111827" }}>
          My Quotations
        </h1>

        {/* Filter tabs */}
        <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1 sm:w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                filter === f.key
                  ? "bg-white text-[#1E40AF] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-slate-500">No quotations yet. Start by adding items to your cart.</p>
              <Link
                href="/browse"
                className="mt-6 rounded-[8px] bg-[#1E40AF] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
              >
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {rows.map((q) => (
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
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
            <span>Showing {start}–{end} of {total} quotations</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(pageParam - 1)}
                disabled={pageParam <= 1}
                className="rounded-[8px] border border-slate-200 px-4 py-2 font-semibold transition hover:bg-slate-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="flex items-center px-3 font-medium text-slate-900">
                {pageParam} / {totalPages}
              </span>
              <button
                onClick={() => setPage(pageParam + 1)}
                disabled={pageParam >= totalPages}
                className="rounded-[8px] border border-slate-200 px-4 py-2 font-semibold transition hover:bg-slate-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuotationsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <QuotationsContent />
    </Suspense>
  );
}
