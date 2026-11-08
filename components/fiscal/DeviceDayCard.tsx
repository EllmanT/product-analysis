"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

import CloseDayDialog from "@/components/fiscal/CloseDayDialog";
import { DayStatusBadge, type DeviceDay } from "@/components/fiscal/DayStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The one sentence that matters for this device right now, most urgent first. */
function Message({ day }: { day: DeviceDay }) {
  if (day.closeProgress) {
    return (
      <p className="text-sm text-amber-900">
        <strong>Closing the day: sending waiting sales first.</strong> {day.closeProgress.sent} of {day.closeProgress.total} done. The day closes by itself when they are all sent.
      </p>
    );
  }
  if (day.state === "unreachable") {
    return (
      <p className="text-sm text-amber-900">
        <strong>We can&apos;t reach this device.</strong> Sales are saved and will be fiscalised when it is back.
        {day.message ? <span className="mt-0.5 block text-xs text-amber-800/80">{day.message}</span> : null}
      </p>
    );
  }
  if (day.state === "close_failed") {
    return (
      <p className="text-sm text-red-800">
        <strong>ZIMRA refused to close this day{day.closingErrorCode ? ` (${day.closingErrorCode})` : ""}.</strong>{" "}
        {day.closingErrorCode === "ReceiptsWithValidationErrors"
          ? "A receipt with validation errors cannot be fixed by retrying. Selling can continue, but ZIMRA must close this day."
          : "Selling can continue. The system keeps retrying; contact support if this repeats."}
      </p>
    );
  }
  if (day.state === "not_managed") {
    return (
      <p className="text-sm text-amber-900">
        <strong>This day was opened outside StockFlow, so it can&apos;t be used safely.</strong> Close it on the ZIMRA portal, then press Refresh and open a new day here.
      </p>
    );
  }
  if (day.state === "open") {
    if (day.unsent === null) return <p className="text-sm text-amber-900">We could not read the upload queue. Closing is held until we can.</p>;
    if (day.unsent > 0)
      return (
        <p className="text-sm text-amber-900">
          <strong>
            {day.unsent} receipt{day.unsent === 1 ? "" : "s"} still going to ZIMRA.
          </strong>{" "}
          Wait before closing the day.
        </p>
      );
    return <p className="text-sm text-emerald-800">Everything has reached ZIMRA. You can close the day when sales are finished.</p>;
  }
  return <p className="text-sm text-muted-foreground">Open the day before the first sale of the morning.</p>;
}


type Totals = {
  available: boolean;
  reason?: string;
  receipts?: number;
  rows: { currency: string; deviceSales: number; deviceCredits: number }[];
};

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Both currencies are always shown, so a zero is visible instead of a missing line.
const CURRENCIES = ["USD", "ZWG"];

/** What this device has sold so far today, as the device itself counts it (the figures it signs at close). */
function DayTotals({ day }: { day: DeviceDay }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    setFailed(false);
    (async () => {
      try {
        const r = await fetch(`/api/admin/fiscal-day/preview?deviceKey=${encodeURIComponent(day.key)}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as { success: boolean; data?: Totals } | null;
        if (ignore) return;
        if (j?.success && j.data) setTotals(j.data);
        else setFailed(true);
      } catch {
        if (!ignore) setFailed(true);
      }
    })();
    return () => {
      ignore = true;
    };
    // Asked again whenever the page re-reads the device.
  }, [day.key, day.checkedAt]);

  if (failed && !totals) return <p className="text-xs text-muted-foreground">Totals are not available right now.</p>;
  if (!totals) return <Skeleton className="h-14 w-full" />;

  // The device has no counters yet (nothing sold): show zeros, not an error.
  const rows = totals.available ? totals.rows : [];
  const net = (c: string) => {
    const r = rows.find((x) => x.currency === c);
    return r ? r.deviceSales - r.deviceCredits : 0;
  };
  const extra = rows.filter((r) => !CURRENCIES.includes(r.currency));

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="font-medium">Totals</span>
        <span>
          {totals.receipts ?? 0} receipt{totals.receipts === 1 ? "" : "s"}
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-6">
        {[...CURRENCIES, ...extra.map((r) => r.currency)].map((c) => (
          <div key={c}>
            <dt className="text-xs text-muted-foreground">{c}</dt>
            <dd className="text-xl font-semibold tabular-nums text-slate-900">{money(net(c))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function DeviceDayCard({ day, onChanged }: { day: DeviceDay; onChanged: () => void }) {
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [zReport, setZReport] = useState<string | null>(null);

  async function openDay() {
    setOpening(true);
    try {
      const res = await fetch("/api/admin/fiscal-day/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey: day.key }),
      });
      const json = (await res.json().catch(() => null)) as { success: boolean; message?: string } | null;
      if (res.ok && json?.success) {
        toast.success(`Fiscal day opened on ${day.name}`);
        onChanged();
      } else {
        toast.error(json?.message ?? "The day could not be opened");
      }
    } catch {
      toast.error("Network error. The day was not opened.");
    } finally {
      setOpening(false);
    }
  }

  const tint =
    day.state === "unreachable" || day.state === "not_managed" ? "border-amber-200 bg-amber-50/40" : day.state === "close_failed" ? "border-red-200 bg-red-50/40" : "bg-card";

  return (
    <section className={`flex flex-col gap-4 rounded-xl border p-5 shadow-xs ${tint}`} aria-label={day.name}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            <span className="truncate">{day.name}</span>
            {day.isCentral && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                <Star className="size-3 fill-current" aria-hidden /> Central
              </span>
            )}
          </h2>
        </div>
        <DayStatusBadge day={day} />
      </header>

      <Message day={day} />

      {(day.state === "open" || day.state === "close_failed") && <DayTotals day={day} />}

      {zReport && (
        <p className="text-sm">
          <Link href={`/z-reports/${zReport}/print`} target="_blank" className="font-medium text-emerald-800 underline underline-offset-4">
            Print the Z-report for this close
          </Link>
        </p>
      )}

      <div className="mt-auto flex justify-end">
        {day.state === "closed" && (
          <Button type="button" onClick={() => void openDay()} disabled={opening} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {opening ? "Opening…" : "Open day"}
          </Button>
        )}
        {(day.state === "open" || day.state === "close_failed") && (
          <Button type="button" variant="outline" onClick={() => setClosing(true)} className="border-red-300 text-red-700 hover:bg-red-50">
            Close day…
          </Button>
        )}
      </div>

      <CloseDayDialog
        day={day}
        open={closing}
        onOpenChange={setClosing}
        onClosed={(reportId) => {
          setClosing(false);
          setZReport(reportId);
          toast.success(`Fiscal day closed on ${day.name}`);
          onChanged();
        }}
      />
    </section>
  );
}
