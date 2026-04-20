"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Row = {
  _id: string;
  source: string;
  closedAt: string;
  fiscalDayNo: number | null;
  totalSalesUsd: number | null;
  totalSalesZwg: number | null;
};

type Totals = {
  sumUsd: number;
  sumZwg: number;
  reportCount: number;
};

function fmtMoney(n: number | null, cur: string): string {
  if (n == null) return "—";
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ZReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/z-reports");
      const json = (await res.json()) as {
        success: boolean;
        data?: { reports: Row[]; totals: Totals };
        message?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? "Failed to load");
        return;
      }
      setRows(json.data.reports);
      setTotals(json.data.totals);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Z-reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            End-of-day totals captured when the fiscal day is closed (manual or scheduled).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button asChild className="bg-slate-900 text-white hover:bg-slate-800">
            <Link href="/z-reports/print-all" target="_blank">
              Print all
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {totals && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">Sum USD (known rows)</p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {fmtMoney(totals.sumUsd, "USD")}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">Sum ZWG (known rows)</p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {fmtMoney(totals.sumZwg, "ZWG")}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">Reports</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{totals.reportCount}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3">Closed</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Fiscal day</th>
              <th className="px-4 py-3">USD</th>
              <th className="px-4 py-3">ZWG</th>
              <th className="px-4 py-3">Print</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No Z-reports yet. Close a fiscal day to create one.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className="border-b border-slate-100">
                  <td className="px-4 py-3 text-slate-800">{fmtDate(r.closedAt)}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{r.source}</td>
                  <td className="px-4 py-3">{r.fiscalDayNo ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{fmtMoney(r.totalSalesUsd, "")}</td>
                  <td className="px-4 py-3 font-mono text-xs">{fmtMoney(r.totalSalesZwg, "")}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/z-reports/${r._id}/print`}
                      target="_blank"
                      className="text-emerald-700 underline hover:text-emerald-900"
                    >
                      Print
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
