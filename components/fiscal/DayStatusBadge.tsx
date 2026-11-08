"use client";

import { useCallback, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { DeviceDay } from "@/lib/services/fiscalDayOverview.service";
import type { DayState } from "@/lib/fiscal/dayState";

export type { DayState, DeviceDay };

const STYLE: Record<DayState, { label: string; dot: string; chip: string }> = {
  open: { label: "Day open", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  not_managed: { label: "Open elsewhere", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
  // Closed is the normal state overnight, so it is neutral, not an alarm.
  closed: { label: "Day closed", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700 ring-slate-200" },
  close_failed: { label: "Close failed", dot: "bg-red-500", chip: "bg-red-50 text-red-800 ring-red-200" },
  unreachable: { label: "Can't reach device", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
};

export function DayStatusBadge({ day, showNumber = true }: { day: Pick<DeviceDay, "state" | "fiscalDayNo">; showNumber?: boolean }) {
  const s = STYLE[day.state];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.chip}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
      {showNumber && day.state === "open" && day.fiscalDayNo ? <span className="font-normal opacity-80">· Day {day.fiscalDayNo}</span> : null}
    </span>
  );
}

export function DayStatusBadgeSkeleton() {
  return <Skeleton className="h-5 w-24 rounded-full" />;
}

/** Every device's fiscal day. `days` is null until the first answer; `reload` asks again. */
export function useDayOverview() {
  const [days, setDays] = useState<DeviceDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/fiscal-day/overview", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { success: boolean; data?: DeviceDay[]; message?: string } | null;
      if (j?.success && j.data) setDays(j.data);
      else setError(j?.message ?? `Request failed (${r.status})`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { days, loading, error, reload };
}
