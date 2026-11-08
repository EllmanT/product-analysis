"use client";

import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ZReportDocument, { ZReportStyles, type ZReportDetail, type ZReportLayout } from "@/components/zreport/ZReportDocument";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ZReportPrintPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [report, setReport] = useState<ZReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<ZReportLayout>("a4");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/z-reports/${id}`);
      const json = (await res.json()) as { success: boolean; data?: ZReportDetail; message?: string };
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
    <div className="zr-screen min-h-screen bg-white px-4 py-6 print:p-0">
      <ZReportStyles layout={layout} />
      <div className="zr-toolbar mx-auto mb-6 flex max-w-[760px] items-center justify-between gap-3 print:hidden">
        <div role="group" aria-label="Paper size" className="inline-flex rounded-md border p-0.5 text-sm">
          {(["a4", "slip"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layout === l}
              onClick={() => setLayout(l)}
              className={cn(
                "rounded px-3 py-1.5 font-medium transition-colors",
                layout === l ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {l === "a4" ? "A4 page" : "Till slip (80mm)"}
            </button>
          ))}
        </div>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Print
        </Button>
      </div>

      <ZReportDocument report={report} layout={layout} />

      {report.rawCloseResponse != null && (
        <details className="mx-auto mt-10 max-w-[760px] text-xs text-slate-600 print:hidden">
          <summary className="cursor-pointer font-medium">Technical detail (what ZIMRA returned)</summary>
          <pre className="mt-2 max-h-[420px] overflow-auto rounded border border-slate-200 bg-slate-50 p-3">
            {JSON.stringify(report.rawCloseResponse, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
