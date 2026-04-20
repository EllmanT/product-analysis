"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type Settings = {
  zimraApiUrl: string | null;
  deviceId: string | null;
  deviceSerialNumber: string | null;
  hasClientCert: boolean;
  hasClientKey: boolean;
  hasPfx: boolean;
  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  closeTime: string;
  openTime: string;
  timezone: string;
  closeWeekdays: number[];
  openWeekdays: number[];
};

const WD_LABELS: { v: number; label: string }[] = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 7, label: "Sun" },
];

export default function FiscalSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [zimraApiUrl, setZimraApiUrl] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [hasPem, setHasPem] = useState(false);
  const [hasPfx, setHasPfx] = useState(false);

  const [autoSchedule, setAutoSchedule] = useState(false);
  const [autoClose, setAutoClose] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [closeTime, setCloseTime] = useState("00:00");
  const [openTime, setOpenTime] = useState("00:05");
  const [timezone, setTimezone] = useState("Africa/Harare");
  const [closeWd, setCloseWd] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [openWd, setOpenWd] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);

  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [pfxPass, setPfxPass] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fiscal-settings");
      const json = (await res.json()) as { success: boolean; data?: Settings; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? "Failed to load");
        return;
      }
      const d = json.data;
      setZimraApiUrl(d.zimraApiUrl ?? "");
      setDeviceId(d.deviceId ?? "");
      setDeviceSerial(d.deviceSerialNumber ?? "");
      setHasPem(d.hasClientCert && d.hasClientKey);
      setHasPfx(d.hasPfx);
      setAutoSchedule(d.autoScheduleEnabled);
      setAutoClose(d.autoCloseEnabled);
      setAutoOpen(d.autoOpenEnabled);
      setCloseTime(d.closeTime);
      setOpenTime(d.openTime);
      setTimezone(d.timezone);
      setCloseWd(d.closeWeekdays?.length ? d.closeWeekdays : [1, 2, 3, 4, 5, 6, 7]);
      setOpenWd(d.openWeekdays?.length ? d.openWeekdays : [1, 2, 3, 4, 5, 6, 7]);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleWd(
    list: number[],
    setList: (v: number[]) => void,
    day: number
  ) {
    if (list.includes(day)) {
      const next = list.filter((x) => x !== day);
      setList(next.length ? next : [day]);
    } else {
      setList([...list, day].sort((a, b) => a - b));
    }
  }

  async function saveGeneral() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/admin/fiscal-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zimraApiUrl: zimraApiUrl.trim() || null,
          deviceId: deviceId.trim() || null,
          deviceSerialNumber: deviceSerial.trim() || null,
          autoScheduleEnabled: autoSchedule,
          autoCloseEnabled: autoClose,
          autoOpenEnabled: autoOpen,
          closeTime,
          openTime,
          timezone: timezone.trim() || "Africa/Harare",
          closeWeekdays: closeWd,
          openWeekdays: openWd,
        }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(typeof json.message === "string" ? json.message : "Save failed");
        return;
      }
      setOk("Settings saved.");
      await load();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPem() {
    if (!certFile || !keyFile) {
      setError("Choose certificate (.crt/.pem) and private key (.key)");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("cert", certFile);
      fd.append("key", keyFile);
      const res = await fetch("/api/admin/fiscal-settings/certificates", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Upload failed");
        return;
      }
      setOk("PEM certificate and key stored.");
      setCertFile(null);
      setKeyFile(null);
      await load();
    } catch {
      setError("Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPfx() {
    if (!pfxFile) {
      setError("Choose a .pfx file");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("mode", "pfx");
      fd.append("pfx", pfxFile);
      fd.append("passphrase", pfxPass);
      const res = await fetch("/api/admin/fiscal-settings/certificates", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Upload failed");
        return;
      }
      setOk("PFX stored.");
      setPfxFile(null);
      setPfxPass("");
      await load();
    } catch {
      setError("Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearPem() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("mode", "clear_pem");
      await fetch("/api/admin/fiscal-settings/certificates", { method: "POST", body: fd });
      setOk("PEM cleared.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function clearPfx() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("mode", "clear_pfx");
      await fetch("/api/admin/fiscal-settings/certificates", { method: "POST", body: fd });
      setOk("PFX cleared.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 lg:px-6">
        <p className="text-slate-500">Loading fiscal settings…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 lg:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fiscalization settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          ZIMRA FDMS base URL, device identifiers, TLS client certificates, and automatic fiscal
          day schedule. Use a scheduler to call{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">GET /api/cron/fiscal-schedule</code>{" "}
          every minute with <code className="rounded bg-slate-100 px-1 text-xs">Authorization: Bearer CRON_SECRET</code>.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {ok}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Connection &amp; device</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="apiUrl">ZIMRA API base URL</Label>
            <Input
              id="apiUrl"
              placeholder="https://fdmsapitest.zimra.co.zw or http://127.0.0.1:port"
              value={zimraApiUrl}
              onChange={(e) => setZimraApiUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="devId">Device ID</Label>
            <Input
              id="devId"
              placeholder="e.g. 21806"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serial">Device serial (reference)</Label>
            <Input
              id="serial"
              placeholder="Serial on certificate / FDMS"
              value={deviceSerial}
              onChange={(e) => setDeviceSerial(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Client certificates (HTTPS / mTLS)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload test or production material without changing code. PEM pair or PFX replaces any previous material of the same type.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          PEM stored: {hasPem ? "yes" : "no"} · PFX stored: {hasPfx ? "yes" : "no"}
        </p>

        <Separator className="my-4" />

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">Certificate + key (.crt/.pem + .key)</h3>
            <Input type="file" accept=".pem,.crt,.cer" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
            <Input type="file" accept=".key,.pem" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void uploadPem()} disabled={saving}>
                Upload PEM pair
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void clearPem()} disabled={saving}>
                Clear PEM
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">PFX / PKCS#12</h3>
            <Input type="file" accept=".pfx,.p12" onChange={(e) => setPfxFile(e.target.files?.[0] ?? null)} />
            <Input
              type="password"
              placeholder="PFX passphrase"
              value={pfxPass}
              onChange={(e) => setPfxPass(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void uploadPfx()} disabled={saving}>
                Upload PFX
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void clearPfx()} disabled={saving}>
                Clear PFX
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Automatic fiscal day</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <p className="font-medium text-slate-800">Enable schedule</p>
              <p className="text-xs text-slate-500">Requires external cron hitting the fiscal-schedule endpoint every minute.</p>
            </div>
            <Switch checked={autoSchedule} onCheckedChange={setAutoSchedule} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
            <div>
              <p className="font-medium text-slate-800">Auto-close fiscal day</p>
              <p className="text-xs text-slate-500">Runs CloseFiscalDay and stores a Z-report.</p>
            </div>
            <Switch checked={autoClose} onCheckedChange={setAutoClose} disabled={!autoSchedule} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
            <div>
              <p className="font-medium text-slate-800">Auto-open fiscal day</p>
              <p className="text-xs text-slate-500">Typically a few minutes after close for the new business day.</p>
            </div>
            <Switch checked={autoOpen} onCheckedChange={setAutoOpen} disabled={!autoSchedule} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Close time (local)</Label>
              <Input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} disabled={!autoSchedule} />
            </div>
            <div className="space-y-2">
              <Label>Open time (local)</Label>
              <Input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} disabled={!autoSchedule} />
            </div>
            <div className="space-y-2">
              <Label>IANA timezone</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!autoSchedule} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Close — weekdays (ISO 1–7)</p>
              <div className="flex flex-wrap gap-2">
                {WD_LABELS.map(({ v, label }) => (
                  <label key={v} className="flex cursor-pointer items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={closeWd.includes(v)}
                      onChange={() => toggleWd(closeWd, setCloseWd, v)}
                      disabled={!autoSchedule}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Open — weekdays</p>
              <div className="flex flex-wrap gap-2">
                {WD_LABELS.map(({ v, label }) => (
                  <label key={v} className="flex cursor-pointer items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={openWd.includes(v)}
                      onChange={() => toggleWd(openWd, setOpenWd, v)}
                      disabled={!autoSchedule}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Button className="w-fit bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void saveGeneral()} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
