"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CENTRAL, DeviceSelect, useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import DayPreviewPanel from "@/components/fiscal/DayPreviewPanel";
import FiscalAlertsPanel from "@/components/fiscal/FiscalAlertsPanel";
import { Button } from "@/components/ui/button";

type DeviceHealth = {
  reachable: boolean;
  dayOpen: boolean | null;
  fiscalDayNo: number | null;
  uploadBacklog: number | null;
  dayStatus?: string;
  closingErrorCode?: string;
  message?: string;
};

type FiscalDayState = {
  isOpen: boolean;
  status: string;
  device?: DeviceHealth;
};

export default function FiscalDayPage() {
  const [state, setState] = useState<FiscalDayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"open" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"open" | "close" | null>(null);
  const [posPending, setPosPending] = useState<string | null>(null);
  const [lastZReportId, setLastZReportId] = useState<string | null>(null);
  // Each branch device has its own fiscal day; "central" is the shared one.
  const [deviceKey, setDeviceKey] = useState<string>(CENTRAL);
  const { devices } = useFiscalDevices();
  const centralName = devices.find((d) => d.isCentral)?.name;
  const deviceName = deviceKey === CENTRAL ? (centralName ? `Central device (${centralName})` : "Central device") : (devices.find((d) => d.id === deviceKey)?.name ?? "Device");

  async function loadStatus(key: string = deviceKey) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/fiscal-day/status?deviceKey=${encodeURIComponent(key)}`);
      const json = await res.json() as { success: boolean; isOpen: boolean; status: string; device?: DeviceHealth; message?: string };
      if (res.ok && json.success) {
        setState({ isOpen: json.isOpen, status: json.status, device: json.device });
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
    void loadStatus(deviceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceKey]);

  async function executeAction(action: "open" | "close", force = false) {
    setConfirmAction(null);
    setActionLoading(action);
    setError(null);
    setSuccessMsg(null);
    try {
      setPosPending(null);
      const res = await fetch(`/api/admin/fiscal-day/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey, ...(force ? { force: true } : {}) }),
      });
      const json = await res.json() as {
        success: boolean;
        message?: string;
        code?: string;
        pending?: number;
        report?: { _id: string };
      };
      if (res.status === 409 && json.code === "POS_PENDING") {
        setPosPending(json.message ?? "POS sales are not fiscalised yet.");
        return;
      }
      if (res.ok && json.success) {
        setLastZReportId(action === "close" && json.report?._id ? json.report._id : null);
        setSuccessMsg(action === "open" ? `Fiscal day opened on ${deviceName}.` : `Fiscal day closed on ${deviceName}.`);
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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fiscal day</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage ZIMRA FDMS fiscal day. Opening and closing the fiscal day must be done at the
            start and end of each business day as required by ZIMRA regulations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/fiscal-settings">Fiscalization settings</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/z-reports">Z-reports</Link>
          </Button>
        </div>
      </div>

      {devices.length > 0 && (
        <div className="mt-6">
          <DeviceSelect
            value={deviceKey}
            onChange={(k) => {
              setSuccessMsg(null);
              setPosPending(null);
              setLastZReportId(null);
              setDeviceKey(k);
            }}
            label="Fiscal device"
          />
          <p className="mt-1.5 text-xs text-slate-500">Each device has its own fiscal day. Branches on the central device share one.</p>
        </div>
      )}

      {/* Warning */}
      <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠ <strong>Important:</strong> You must open the fiscal day each morning before processing any invoices.
        Close the fiscal day at the end of each business day. Failure to do so may result in fiscalization errors.
      </div>

      {/* Status card */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700">Current Status{devices.length > 0 ? ` · ${deviceName}` : ""}</h2>

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

        {!loading && state?.device?.reachable && state.device.dayStatus === "FiscalDayCloseFailed" && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            <strong>ZIMRA refused to close this day{state.device.closingErrorCode ? ` (${state.device.closingErrorCode})` : ""}.</strong>{" "}
            {state.device.closingErrorCode === "ReceiptsWithValidationErrors"
              ? "A receipt with validation errors cannot be fixed by retrying. Selling can continue, but ZIMRA must close this day."
              : "Selling can continue. The system keeps retrying the close; contact support if this repeats."}
          </div>
        )}

        {!loading && state?.device && (
          <div
            role="status"
            className={`mt-4 rounded-md border px-4 py-3 text-sm ${
              !state.device.reachable || state.device.uploadBacklog === null || state.device.uploadBacklog > 0
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {!state.device.reachable ? (
              <>
                <strong>Fiscal device not reachable.</strong> Sales are saved and will be fiscalised when it is back.
                {state.device.message ? ` (${state.device.message})` : ""}
              </>
            ) : state.device.uploadBacklog === null ? (
              <>
                <strong>Could not read the device&apos;s upload queue.</strong> Closing the day is held until it can be confirmed.
              </>
            ) : state.device.uploadBacklog > 0 ? (
              <>
                <strong>Device catching up: {state.device.uploadBacklog} receipt{state.device.uploadBacklog === 1 ? "" : "s"} not yet uploaded to ZIMRA.</strong>{" "}
                Invoices are valid, but scanning their QR may say &quot;not found&quot; until this reaches 0. Wait before closing the day.
              </>
            ) : (
              <>
                <strong>All receipts uploaded to ZIMRA.</strong> Safe to close the day when sales are finished.
              </>
            )}
            <button type="button" onClick={() => void loadStatus()} className="ml-3 underline underline-offset-4">
              Refresh
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            {successMsg}
            {lastZReportId && (
              <span className="mt-2 block">
                <Link
                  href={`/z-reports/${lastZReportId}/print`}
                  target="_blank"
                  className="font-semibold text-emerald-900 underline"
                >
                  Print Z-report for this close
                </Link>
              </span>
            )}
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

      {posPending && (
        <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">The day was not closed.</p>
          <p className="mt-1">{posPending}</p>
          <p className="mt-1">
            Open <a className="underline" href="/pos-sales">POS sales</a> to fiscalise them first, or close anyway: sales left
            unfiscalised can then only be fiscalised on a later day with an administrator&apos;s approval.
          </p>
          <div className="mt-3 flex gap-3">
            <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => void executeAction("close", true)}>
              Close anyway
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPosPending(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {confirmAction === "open" ? "Open Fiscal Day?" : "Close Fiscal Day?"}{devices.length > 0 ? ` (${deviceName})` : ""}
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
      <div className="mt-8 space-y-6">
        <DayPreviewPanel key={deviceKey} deviceKey={deviceKey === CENTRAL ? undefined : deviceKey} />
        <FiscalAlertsPanel />
      </div>
    </div>
  );
}
