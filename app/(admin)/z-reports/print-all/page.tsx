"use client";

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

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ZReportsPrintAllPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/z-reports");
    const json = (await res.json()) as {
      success: boolean;
      data?: { reports: Row[]; totals: Totals };
    };
    if (json.success && json.data) {
      setRows(json.data.reports);
      setTotals(json.data.totals);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900 print:p-6">
      <div className="mb-6 flex justify-end print:hidden">
        <Button type="button" onClick={() => window.print()}>
          Print all
        </Button>
      </div>

      <h1 className="text-2xl font-bold">Z-reports — full register</h1>
      <p className="mt-1 text-sm text-slate-600">
        Generated {new Date().toLocaleString()}
      </p>

      {totals && (
        <div className="mt-6 grid gap-4 border border-slate-200 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Sum USD</p>
            <p className="text-lg font-bold">{fmtMoney(totals.sumUsd)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Sum ZWG</p>
            <p className="text-lg font-bold">{fmtMoney(totals.sumZwg)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Row count</p>
            <p className="text-lg font-bold">{totals.reportCount}</p>
          </div>
        </div>
      )}

      <table className="mt-8 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-slate-800">
            <th className="py-2 pr-4">Closed</th>
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Day</th>
            <th className="py-2 pr-4">USD</th>
            <th className="py-2 pr-4">ZWG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="border-b border-slate-200">
              <td className="py-2 pr-4">{new Date(r.closedAt).toLocaleString()}</td>
              <td className="py-2 pr-4 capitalize">{r.source}</td>
              <td className="py-2 pr-4">{r.fiscalDayNo ?? "—"}</td>
              <td className="py-2 pr-4 font-mono">{fmtMoney(r.totalSalesUsd)}</td>
              <td className="py-2 pr-4 font-mono">{fmtMoney(r.totalSalesZwg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
