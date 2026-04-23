"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type InvoiceRow = {
  _id: string;
  invoiceNumber: string;
  createdAt: string;
  total: string;
  status: string;
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

function InvoicesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const LIMIT = 10;

  useEffect(() => {
    setLoading(true);
    (async () => {
      const res = await fetch(
        `/api/shop/account/invoices?page=${pageParam}&limit=${LIMIT}`,
        { credentials: "include" }
      );
      if (res.status === 401) { router.replace("/login?redirect=/account/invoices"); return; }
      if (res.ok) {
        const json = await res.json() as {
          success: boolean;
          data: { invoices: InvoiceRow[]; total: number; page: number; totalPages: number };
        };
        if (json.success) {
          setRows(json.data.invoices);
          setTotal(json.data.total);
          setTotalPages(json.data.totalPages);
        }
      }
      setLoading(false);
    })();
  }, [pageParam, router]);

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/account/invoices?${params.toString()}`);
  }

  const start = (pageParam - 1) * LIMIT + 1;
  const end = Math.min(pageParam * LIMIT, total);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        <nav className="mb-2 text-sm text-[#6B7280]">
          <Link href="/account" className="hover:text-[#1E40AF]">Dashboard</Link>
          <span className="mx-2">/</span>
          <span className="font-medium text-slate-900">Invoices</span>
        </nav>

        <h1 className="font-shop-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          My Invoices
        </h1>

        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-slate-500">No invoices yet. Invoices are generated after payment is confirmed.</p>
              <Link
                href="/account/quotations"
                className="mt-6 rounded-[8px] bg-[#1E40AF] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1E3A8A]"
              >
                View Quotations
              </Link>
            </div>
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
                  {rows.map((inv) => (
                    <tr key={inv._id} className="border-b border-slate-100 last:border-0 hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-slate-600">{fmtDate(inv.createdAt)}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{fmtMoney(inv.total)}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center rounded-[6px] bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                          Paid
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/account/invoices/${inv._id}`}
                            className="rounded-[8px] bg-[#1E40AF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1E3A8A]"
                          >
                            View
                          </Link>
                          <a
                            href={`/api/shop/dashboard/invoices/${inv._id}/pdf`}
                            className="rounded-[8px] border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Download PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && total > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
            <span>Showing {start}–{end} of {total} invoices</span>
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

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <InvoicesContent />
    </Suspense>
  );
}
