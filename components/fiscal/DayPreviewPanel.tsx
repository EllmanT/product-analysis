"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface Row {
  currency: string;
  deviceSales: number;
  appSales: number;
  deviceCredits: number;
  appCredits: number;
  matches: boolean;
}
interface Preview {
  available: boolean;
  reason?: string;
  fiscalDayNo?: number;
  receipts?: number;
  rows: Row[];
  matches: boolean;
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Before closing: do the totals the device will report equal what the app sold today? */
export default function DayPreviewPanel({ deviceKey }: { deviceKey?: string }) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/fiscal-day/preview${deviceKey ? `?deviceKey=${encodeURIComponent(deviceKey)}` : ""}`);
      const j = (await r.json().catch(() => null)) as { success: boolean; data?: Preview; message?: string } | null;
      if (j?.success && j.data) setData(j.data);
      else setError(j?.message ?? `Request failed (${r.status})`);
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, [deviceKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Today&apos;s totals check</h2>
          <p className="text-sm text-muted-foreground">
            The totals the device will report when the day closes, against what the app sold. A difference should be explained before you close.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "Checking…" : "Check again"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {data && !data.available && <p className="text-sm text-muted-foreground">{data.reason}</p>}
      {data?.available && (
        <>
          <p className={`text-sm font-medium ${data.matches ? "text-emerald-700" : "text-red-700"}`}>
            {data.matches ? "Everything agrees" : "The device and the app disagree"} — fiscal day {data.fiscalDayNo}, {data.receipts} receipts
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-4 font-medium">Currency</th>
                <th className="py-1.5 pr-4 text-right font-medium">Device sales</th>
                <th className="py-1.5 pr-4 text-right font-medium">App sales</th>
                <th className="py-1.5 pr-4 text-right font-medium">Device credits</th>
                <th className="py-1.5 pr-4 text-right font-medium">App credits</th>
                <th className="py-1.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.currency} className="border-b last:border-0">
                  <td className="py-1.5 pr-4">{r.currency}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.deviceSales)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.appSales)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.deviceCredits)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.appCredits)}</td>
                  <td className={`py-1.5 ${r.matches ? "text-emerald-700" : "text-red-700"}`}>{r.matches ? "Agrees" : "Differs"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
