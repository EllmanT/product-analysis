"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Report = {
  _id: string;
  source: string;
  closedAt: string;
  fiscalDayNo: number | null;
  totalSalesUsd: number | null;
  totalSalesZwg: number | null;
  rawCloseResponse: unknown;
};

function fmtMoney(n: number | null, cur: string): string {
  if (n == null) return "—";
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ZReportPrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/z-reports/${id}`);
      const json = (await res.json()) as { success: boolean; data?: Report; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? "Not found");
        return;
      }
      setReport(json.data);
    } catch {
      setError("Failed to load");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900 print:p-6">
      <div className="mb-6 flex justify-end print:hidden">
        <Button type="button" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold">Z-report (fiscal day close)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Closed: {new Date(report.closedAt).toLocaleString()} · Source: {report.source}
        </p>
        {report.fiscalDayNo != null && (
          <p className="text-sm text-slate-600">Fiscal day no.: {report.fiscalDayNo}</p>
        )}
      </header>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Total sales USD</h2>
          <p className="mt-2 text-2xl font-bold">{fmtMoney(report.totalSalesUsd, "USD")}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Total sales ZWG</h2>
          <p className="mt-2 text-2xl font-bold">{fmtMoney(report.totalSalesZwg, "ZWG")}</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-slate-700">Raw ZIMRA response (reference)</h2>
        <pre className="mt-2 max-h-[480px] overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs print:max-h-none">
          {JSON.stringify(report.rawCloseResponse, null, 2)}
        </pre>
      </section>
    </div>
  );
}
