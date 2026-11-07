"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import { CENTRAL_ID, DeviceEditor } from "@/components/fiscal/FiscalDevicesManager";
import { Button } from "@/components/ui/button";
import type { FiscalDeviceSafe } from "@/lib/services/fiscalDevice.service";
import type { FiscalSettingsSafe } from "@/lib/services/fiscalSettings.service";

interface BranchRow {
  id: string;
  name: string;
  pos: { enabled: boolean; fiscalDeviceId?: string | null };
}

/** The central settings, shaped like a branch device so the same editor can show and save them. */
function asDevice(s: FiscalSettingsSafe, branches: { id: string; name: string }[]): FiscalDeviceSafe {
  return {
    id: CENTRAL_ID,
    name: "Central device",
    active: true,
    zimraApiUrl: s.zimraApiUrl,
    zimraUseProductionUrl: s.zimraUseProductionUrl,
    effectiveZimraUrl: s.effectiveZimraUrl,
    deviceId: s.deviceId,
    deviceSerialNumber: s.deviceSerialNumber,
    hasClientCert: s.hasClientCert,
    hasClientKey: s.hasClientKey,
    hasPfx: s.hasPfx,
    certSubject: s.certSubject,
    certSerial: s.certSerial,
    certNotAfter: s.certNotAfter,
    certExpiryStatus: s.certExpiryStatus,
    certDaysLeft: s.certDaysLeft,
    secretsEncrypted: s.secretsEncrypted,
    autoRenewCertificate: s.autoRenewCertificate,
    lastRenewalAt: s.lastRenewalAt,
    lastRenewalError: s.lastRenewalError,
    renewalPending: s.renewalPending,
    deviceModelName: null,
    deviceModelVersion: null,
    serviceDeviceId: null,
    isCentral: false,
    vdEmail: null,
    hasVdPassword: false,
    autoScheduleEnabled: s.autoScheduleEnabled,
    autoCloseEnabled: s.autoCloseEnabled,
    autoOpenEnabled: s.autoOpenEnabled,
    closeTime: s.closeTime,
    openTime: s.openTime,
    timezone: s.timezone,
    closeWeekdays: s.closeWeekdays,
    openWeekdays: s.openWeekdays,
    lastAutoCloseDate: s.lastAutoCloseDate,
    lastAutoOpenDate: s.lastAutoOpenDate,
    branches,
  };
}

export default function FiscalSettingsPage() {
  const router = useRouter();
  const { backend, loaded: backendKnown } = useFiscalDevices();
  const [data, setData] = useState<{ settings: FiscalSettingsSafe; branches: { id: string; name: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [s, b] = await Promise.all([
          fetch("/api/admin/fiscal-settings", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/pos/branches", { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (ignore) return;
        if (!s?.success || !s.data) {
          setError(typeof s?.message === "string" ? s.message : "Could not load the central device settings.");
          return;
        }
        const rows: BranchRow[] = b?.success && Array.isArray(b.data) ? b.data : [];
        setData({
          settings: s.data,
          // A POS branch with no device of its own uses the central device.
          branches: rows.filter((r) => r.pos?.enabled && !r.pos.fiscalDeviceId).map((r) => ({ id: r.id, name: r.name })),
        });
        setError(null);
      } catch {
        if (!ignore) setError("Network error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const device = data ? asDevice(data.settings, data.branches) : null;

  // With the fiscal service every device, central or not, is managed on Fiscal devices. This address only forwards there.
  useEffect(() => {
    if (backendKnown && backend === "service") router.replace("/fiscal-devices");
  }, [backendKnown, backend, router]);
  if (!backendKnown || backend === "service") return <p className="p-6 text-sm text-muted-foreground">Opening Fiscal devices…</p>;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Central device settings</h1>
          <p className="text-sm text-muted-foreground">
            The device every branch uses unless it has its own. It is set up exactly like a branch device, on the same screen.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/fiscal-devices">Branch devices</Link>
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {!device && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {device && data && (
        <DeviceEditor
          // Remount whenever what is stored changes so the form shows what was saved.
          key={`${data.settings.certSerial}:${data.settings.deviceId}:${data.settings.zimraApiUrl}:${data.settings.openTime}:${data.settings.closeTime}:${data.settings.autoScheduleEnabled}:${data.branches.length}`}
          device={device}
          encryptionConfigured={data.settings.encryptionConfigured}
          onSaved={() => setReloadKey((n) => n + 1)}
          onClose={() => undefined}
          onDeleted={() => undefined}
        />
      )}

      <p className="text-xs text-muted-foreground">
        The schedule runs when something calls <code className="rounded bg-muted px-1">GET /api/cron/fiscal-schedule</code> every minute with{" "}
        <code className="rounded bg-muted px-1">Authorization: Bearer CRON_SECRET</code>. A shared Axis virtual device, for example{" "}
        <code className="rounded bg-muted px-1">http://140.82.25.196:10005</code>, needs no login: leave <code className="rounded bg-muted px-1">ZIMRA_VD_EMAIL</code> and{" "}
        <code className="rounded bg-muted px-1">ZIMRA_VD_PASSWORD</code> unset.
      </p>
    </div>
  );
}
