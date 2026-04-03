"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  createdAt: string;
  itemCount: number;
  subtotal: string;
  status: string;
  paymentStatus: string;
};

function StatusBadge({ status }: { status: string }) {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "pending") {
    return (
      <span className={`${base} bg-blue-100 text-blue-800`}>Pending</span>
    );
  }
  if (status === "confirmed") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800`}>
        Confirmed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className={`${base} bg-slate-200 text-slate-700`}>Cancelled</span>
    );
  }
  if (status === "invoiced") {
    return (
      <span className={`${base} bg-purple-100 text-purple-800`}>Invoiced</span>
    );
  }
  return <span className={`${base} bg-slate-100 text-slate-700`}>{status}</span>;
}

export default function QuotationsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/shop/quotations", { credentials: "include" });
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/login?redirect=/quotations");
        return;
      }
      if (!res.ok) {
        setError("Could not load quotations.");
        setRows([]);
        return;
      }
      const json = (await res.json()) as {
        success: boolean;
        data: Row[];
      };
      if (json.success && Array.isArray(json.data)) {
        setRows(
          json.data.map((r) => ({
            ...r,
            createdAt:
              typeof r.createdAt === "string"
                ? r.createdAt
                : new Date(r.createdAt).toISOString(),
          }))
        );
      } else {
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (rows === null && !error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-600">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <h1 className="text-3xl font-bold text-slate-900">My Quotations</h1>
        <p className="mt-4 text-slate-600">No quotations yet.</p>
        <Link
          href="/"
          className="mt-8 rounded-lg bg-[#2563EB] px-8 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        My Quotations
      </h1>

      <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <th className="px-6 py-3 font-semibold">Quotation ID</th>
              <th className="px-6 py-3 font-semibold">Date</th>
              <th className="px-6 py-3 font-semibold">Items</th>
              <th className="px-6 py-3 font-semibold">Subtotal</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.id}
                className={idx % 2 === 1 ? "bg-slate-50/80" : "bg-white"}
              >
                <td className="px-6 py-4 font-mono text-xs text-slate-800">
                  {r.id.slice(0, 10)}…
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-6 py-4 text-slate-700">{r.itemCount}</td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  ${parseFloat(r.subtotal).toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={`/quotations/${r.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
