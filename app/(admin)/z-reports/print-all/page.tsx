"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import ZReportDocument, { ZReportStyles, type ZReportDetail } from "@/components/zreport/ZReportDocument";
import { Button } from "@/components/ui/button";

/** Printing every report at once is capped so the page stays quick; the newest come first. */
const MAX_REPORTS = 60;

function PrintAll() {
  const deviceKey = useSearchParams().get("deviceKey") ?? "";
  const [reports, setReports] = useState<ZReportDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/z-reports${deviceKey ? `?deviceKey=${encodeURIComponent(deviceKey)}` : ""}`);
        const json = (await res.json()) as { success: boolean; data?: { reports: { _id: string }[] }; message?: string };
        if (!res.ok || !json.success || !json.data) throw new Error(json.message ?? "Could not load the reports");
        const list = json.data.reports;
        if (!ignore) setTotal(list.length);
        const details = await Promise.all(
          list.slice(0, MAX_REPORTS).map(async (r) => {
            const d = await fetch(`/api/admin/z-reports/${r._id}`);
            const j = (await d.json()) as { success: boolean; data?: ZReportDetail };
            return j.success && j.data ? j.data : null;
          })
        );
        if (!ignore) setReports(details.filter((d): d is ZReportDetail => d !== null));
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [deviceKey]);

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!reports) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <div className="zr-screen min-h-screen bg-white px-4 py-6 print:p-0">
      <ZReportStyles layout="a4" />
      <div className="mx-auto mb-6 flex max-w-[760px] items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-600">
          {reports.length} report{reports.length === 1 ? "" : "s"}, one per page
          {total > MAX_REPORTS && ` (the newest ${MAX_REPORTS} of ${total})`}
        </p>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Print all
        </Button>
      </div>
      {reports.length === 0 && <p className="text-center text-slate-500">No Z-reports yet.</p>}
      {reports.map((r, i) => (
        <div key={r._id} className={i < reports.length - 1 ? "zr-pagebreak mb-10 print:mb-0" : ""}>
          <ZReportDocument report={r} layout="a4" />
        </div>
      ))}
    </div>
  );
}

export default function ZReportsPrintAllPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <PrintAll />
    </Suspense>
  );
}
