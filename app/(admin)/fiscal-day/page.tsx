"use client";

import Link from "next/link";
import { Bell, RefreshCw } from "lucide-react";

import DeviceDayCard from "@/components/fiscal/DeviceDayCard";
import { useDayOverview } from "@/components/fiscal/DayStatusBadge";
import FiscalAlertsPanel from "@/components/fiscal/FiscalAlertsPanel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

// Devices that need attention first, then open ones, then closed ones.
const ORDER = { close_failed: 0, not_managed: 1, unreachable: 2, open: 3, closed: 4 } as const;

export default function FiscalDayPage() {
  const { days, loading, error, reload } = useDayOverview();
  const sorted = days ? [...days].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name)) : null;

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fiscal day</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Open each device&apos;s day before its first sale and close it when selling is finished. Each device has its own day.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
            {loading ? "Checking…" : "Refresh"}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Bell className="size-4" aria-hidden /> Alerts
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
              <SheetHeader>
                <SheetTitle>Fiscal alerts</SheetTitle>
                <SheetDescription>Problems the system found, and who gets the alert emails.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <FiscalAlertsPanel />
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/z-reports">Z-reports</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/fiscal-devices">Devices</Link>
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}. <button type="button" className="underline underline-offset-4" onClick={() => void reload()}>Try again</button>
        </p>
      )}

      {!sorted ? (
        loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : null
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No fiscal devices yet. Add one under <Link href="/fiscal-devices" className="underline underline-offset-2">Fiscal devices</Link>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((d) => (
            <DeviceDayCard key={d.key} day={d} onChanged={() => void reload()} />
          ))}
        </div>
      )}
    </div>
  );
}
