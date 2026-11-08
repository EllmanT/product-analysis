"use client";

import { useState } from "react";

import DayPreviewPanel from "@/components/fiscal/DayPreviewPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DeviceDay } from "@/components/fiscal/DayStatusBadge";

type CloseResult = { success: boolean; message?: string; code?: string; report?: { _id: string } };

/**
 * Closing is the one step that cannot be taken back, so it gets its own dialog: the totals check, the
 * "receipts still waiting" warning and one confirm button. If sales are still unfiscalised the same dialog
 * moves to a second step instead of raising a separate banner.
 */
export default function CloseDayDialog({
  day,
  open,
  onOpenChange,
  onClosed,
}: {
  day: DeviceDay;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onClosed: (reportId: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function close(force = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fiscal-day/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey: day.key, ...(force ? { force: true } : {}) }),
      });
      const json = (await res.json().catch(() => null)) as CloseResult | null;
      if (res.status === 409 && json?.code === "POS_PENDING") {
        setPending(json.message ?? "Some POS sales are not fiscalised yet.");
        return;
      }
      if (res.ok && json?.success) {
        reset();
        onClosed(json.report?._id ?? null);
        return;
      }
      setError(json?.message ?? "The day could not be closed");
    } catch {
      setError("Network error. The day was not closed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPending(null);
    setError(null);
  }

  const waiting = day.unsent ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Close the fiscal day on {day.name}?</DialogTitle>
          <DialogDescription>No more invoices can be fiscalised on this device until you open the next day.</DialogDescription>
        </DialogHeader>

        {pending ? (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">The day was not closed.</p>
            <p>{pending}</p>
            <p>
              Fiscalise them first in <a className="underline" href="/pos-sales">POS sales</a>. If you close anyway, sales left unfiscalised can only be
              fiscalised on a later day with an administrator&apos;s approval.
            </p>
          </div>
        ) : (
          <>
            {waiting !== null && waiting > 0 && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <strong>
                  {waiting} receipt{waiting === 1 ? " is" : "s are"} still waiting for ZIMRA.
                </strong>{" "}
                Wait until this reaches 0 before closing.
              </p>
            )}
            {waiting === null && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                We could not read the device&apos;s upload queue, so closing is held until it can be confirmed.
              </p>
            )}
            <div className="max-h-[50vh] overflow-y-auto">
              <DayPreviewPanel deviceKey={day.key === "central" ? undefined : day.key} />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {pending ? (
            <Button type="button" className="bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={() => void close(true)}>
              {busy ? "Closing…" : "Close anyway"}
            </Button>
          ) : (
            <Button type="button" className="bg-red-600 text-white hover:bg-red-700" disabled={busy || waiting === null} onClick={() => void close()}>
              {busy ? "Closing…" : "Close day"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
