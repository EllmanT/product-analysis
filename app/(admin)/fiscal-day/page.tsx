"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type FiscalDayState = {
  isOpen: boolean;
  status: string;
};

export default function FiscalDayPage() {
  const [state, setState] = useState<FiscalDayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"open" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"open" | "close" | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fiscal-day/status");
      const json = await res.json() as { success: boolean; isOpen: boolean; status: string; message?: string };
      if (res.ok && json.success) {
        setState({ isOpen: json.isOpen, status: json.status });
      } else {
        setError(json.message ?? "Failed to fetch fiscal day status");
      }
    } catch {
      setError("Network error — could not reach ZIMRA device");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function executeAction(action: "open" | "close") {
    setConfirmAction(null);
    setActionLoading(action);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/admin/fiscal-day/${action}`, { method: "POST" });
      const json = await res.json() as { success: boolean; message?: string };
      if (res.ok && json.success) {
        setSuccessMsg(action === "open" ? "Fiscal day opened successfully." : "Fiscal day closed successfully.");
        await loadStatus();
      } else {
        setError(json.message ?? `Failed to ${action} fiscal day`);
      }
    } catch {
      setError(`Network error — failed to ${action} fiscal day`);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-8 lg:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Fiscal Day Management</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage ZIMRA FDMS fiscal day. Opening and closing the fiscal day must be done at the
        start and end of each business day as required by ZIMRA regulations.
      </p>

      {/* Warning */}
      <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠ <strong>Important:</strong> You must open the fiscal day each morning before processing any invoices.
        Close the fiscal day at the end of each business day. Failure to do so may result in fiscalization errors.
      </div>

      {/* Status card */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700">Current Status</h2>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Checking ZIMRA device status…
          </div>
        ) : state ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {state.isOpen ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-5 py-2 text-lg font-bold text-emerald-800">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                Fiscal Day OPEN
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-5 py-2 text-lg font-bold text-red-800">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                Fiscal Day CLOSED
              </span>
            )}
            <span className="text-sm text-slate-500">ZIMRA status: <strong>{state.status || "Unknown"}</strong></span>
          </div>
        ) : null}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            {successMsg}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={loading || actionLoading !== null || state?.isOpen === true}
            onClick={() => setConfirmAction("open")}
          >
            {actionLoading === "open" ? "Opening…" : "Open Fiscal Day"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60"
            disabled={loading || actionLoading !== null || state?.isOpen === false}
            onClick={() => setConfirmAction("close")}
          >
            {actionLoading === "close" ? "Closing…" : "Close Fiscal Day"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => void loadStatus()}
          >
            Refresh Status
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {confirmAction === "open" ? "Open Fiscal Day?" : "Close Fiscal Day?"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {confirmAction === "open"
                ? "This will open the ZIMRA fiscal day, allowing invoices to be fiscalized."
                : "This will close the ZIMRA fiscal day. No more invoices can be fiscalized until the next day is opened."}
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                type="button"
                className={confirmAction === "open" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-red-600 text-white hover:bg-red-700"}
                onClick={() => void executeAction(confirmAction)}
              >
                Confirm
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
