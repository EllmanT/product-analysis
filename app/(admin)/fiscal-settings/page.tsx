"use client";

import { useCallback, useEffect, useState, type InputHTMLAttributes } from "react";

import type { CertBundleValidation } from "@/lib/fiscalCertBundle";
import { ZIMRA_DEFAULT_TEST_BASE } from "@/lib/zimraConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type Settings = {
  zimraApiUrl: string | null;
  zimraUseProductionUrl: boolean;
  effectiveZimraUrl: string;
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
  const [syncingDevice, setSyncingDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [zimraApiUrl, setZimraApiUrl] = useState("");
  const [zimraProduction, setZimraProduction] = useState(false);
  const [effectiveZimraUrl, setEffectiveZimraUrl] = useState(ZIMRA_DEFAULT_TEST_BASE);
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
  const [bundleZip, setBundleZip] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [bundleValidation, setBundleValidation] = useState<CertBundleValidation | null>(null);

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
      setZimraProduction(d.zimraUseProductionUrl === true);
      setEffectiveZimraUrl(d.effectiveZimraUrl || ZIMRA_DEFAULT_TEST_BASE);
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

  async function syncDeviceFromZimra() {
    setSyncingDevice(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/admin/fiscal-settings/sync-device", { method: "POST" });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(typeof json.message === "string" ? json.message : "Sync failed");
        return;
      }
      setOk("Device ID and serial updated from ZIMRA GetConfig.");
      await load();
    } catch {
      setError("Sync failed");
    } finally {
      setSyncingDevice(false);
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
          zimraUseProductionUrl: zimraProduction,
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

  async function checkBundle() {
    setSaving(true);
    setError(null);
    setOk(null);
    setBundleValidation(null);
    try {
      const fd = new FormData();
      fd.append("dryRun", "true");
      fd.append("passphrase", pfxPass);
      if (bundleZip) {
        fd.append("mode", "bundle_zip");
        fd.append("bundle", bundleZip);
      } else if (folderFiles.length > 0) {
        fd.append("mode", "bundle_folder");
        for (const f of folderFiles) fd.append("files", f);
      } else {
        setError("Select a .zip file or a certificate folder first.");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/admin/fiscal-settings/certificates", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        success: boolean;
        validation?: CertBundleValidation;
        storable?: boolean;
        message?: string;
      };
      if (json.validation) setBundleValidation(json.validation);
      if (!res.ok || !json.success) {
        setError(json.message ?? "Check failed");
        return;
      }
      setOk(
        json.storable
          ? "Bundle looks complete — you can apply it to store certificates."
          : "Bundle is incomplete — see details below."
      );
    } catch {
      setError("Check failed");
    } finally {
      setSaving(false);
    }
  }

  async function applyBundle() {
    setSaving(true);
    setError(null);
    setOk(null);
    setBundleValidation(null);
    try {
      const fd = new FormData();
      fd.append("dryRun", "false");
      fd.append("passphrase", pfxPass);
      if (bundleZip) {
        fd.append("mode", "bundle_zip");
        fd.append("bundle", bundleZip);
      } else if (folderFiles.length > 0) {
        fd.append("mode", "bundle_folder");
        for (const f of folderFiles) fd.append("files", f);
      } else {
        setError("Select a .zip file or a certificate folder first.");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/admin/fiscal-settings/certificates", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        success: boolean;
        validation?: CertBundleValidation;
        message?: string;
      };
      if (json.validation) setBundleValidation(json.validation);
      if (!res.ok || !json.success) {
        setError(json.message ?? "Upload failed");
        return;
      }
      setOk("Certificate bundle saved.");
      setBundleZip(null);
      setFolderFiles([]);
      await load();
    } catch {
      setError("Upload failed");
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
        <p className="mt-1 text-sm text-slate-500">
          API base defaults to the ZIMRA <strong>test</strong> host. Turn on production to drop{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">test</code> from the hostname (e.g.{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">fdmsapitest</code> →{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">fdmsapi</code>).
          Paths under <code className="rounded bg-slate-100 px-1 text-xs">/api/VirtualDevice/</code> are
          usually served by the <strong>Virtual Fiscal Device</strong> on your PC; if you get HTTP 404 on
          fdmsapi*.zimra.co.zw, set a custom base such as{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">https://127.0.0.1:port</code> from your FDMS docs.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-800">Production ZIMRA URL</p>
              <p className="text-xs text-slate-500">
                Off = test environment. On = same settings but hostname has “test” removed.
              </p>
            </div>
            <Switch checked={zimraProduction} onCheckedChange={setZimraProduction} />
          </div>
          <div className="md:col-span-2 space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <Label className="text-slate-700">Effective API base (used for FDMS calls)</Label>
            <p className="font-mono text-sm font-semibold text-emerald-900 break-all">{effectiveZimraUrl}</p>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="apiUrl">Custom base URL override (optional)</Label>
            <Input
              id="apiUrl"
              placeholder={`Leave empty for ${ZIMRA_DEFAULT_TEST_BASE} (or ZIMRA_API_URL from env)`}
              value={zimraApiUrl}
              onChange={(e) => setZimraApiUrl(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Shared Axis VD example: <code className="rounded bg-slate-100 px-1">http://140.82.25.196:10005</code> (no Bearer
              auth — leave <code className="rounded bg-slate-100 px-1">ZIMRA_VD_EMAIL</code> /{" "}
              <code className="rounded bg-slate-100 px-1">ZIMRA_VD_PASSWORD</code> unset) or{" "}
              <code className="rounded bg-slate-100 px-1">http://140.82.25.196:10007</code> (same API paths; set those env
              vars for POST <code className="rounded bg-slate-100 px-1">/api/Auth/login</code>). Also{" "}
              <code className="rounded bg-slate-100 px-1">http://127.0.0.1:port</code> per FDMS docs. Production toggle only
              rewrites hostnames containing “test”.
            </p>
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
            <Label htmlFor="serial">Device serial</Label>
            <Input
              id="serial"
              placeholder="e.g. VR-… (filled from certificate when possible)"
              value={deviceSerial}
              onChange={(e) => setDeviceSerial(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              We read <code className="rounded bg-slate-100 px-1">serialNumber=…</code> from the client cert subject, or fall back to the X.509 serial, when you upload PEM/PFX or a bundle.
            </p>
          </div>
          <div className="md:col-span-2 flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Sync device from ZIMRA</p>
              <p className="text-xs text-slate-500">
                Calls <code className="rounded bg-white px-1">GET /api/VirtualDevice/GetConfig</code> and saves{" "}
                <strong>Device ID</strong> and <strong>serial</strong> (useful for shared test hosts such as :10005).
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={syncingDevice || loading}
              onClick={() => void syncDeviceFromZimra()}
            >
              {syncingDevice ? "Syncing…" : "Sync device from ZIMRA"}
            </Button>
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

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Zip or folder (auto-detect)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Upload the same zip ZIMRA gave you (e.g. <code className="rounded bg-white px-1">certificates_21806.zip</code>) or choose the extracted folder.
            The system finds <strong>PFX</strong> or <strong>cert + key</strong>, ignores CSRs, and reports anything missing.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Zip archive</Label>
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  setBundleZip(e.target.files?.[0] ?? null);
                  setFolderFiles([]);
                  setBundleValidation(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Or certificate folder</Label>
              <Input
                type="file"
                multiple
                className="cursor-pointer"
                {...({
                  webkitdirectory: "",
                  directory: "",
                } as InputHTMLAttributes<HTMLInputElement>)}
                onChange={(e) => {
                  setFolderFiles(Array.from(e.target.files ?? []));
                  setBundleZip(null);
                  setBundleValidation(null);
                }}
              />
            </div>
            <div className="space-y-1 sm:min-w-[140px]">
              <Label className="text-xs">PFX passphrase (if needed)</Label>
              <Input
                type="password"
                placeholder="Optional"
                value={pfxPass}
                onChange={(e) => setPfxPass(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => void checkBundle()} disabled={saving}>
                Check bundle
              </Button>
              <Button type="button" size="sm" onClick={() => void applyBundle()} disabled={saving}>
                Save bundle
              </Button>
            </div>
          </div>
          {(bundleZip || folderFiles.length > 0) && (
            <p className="mt-2 text-xs text-slate-500">
              {bundleZip ? `Zip: ${bundleZip.name}` : `Folder: ${folderFiles.length} file(s)`}
            </p>
          )}
        </div>

        {bundleValidation && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              bundleValidation.missing.length
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
          >
            <p className="font-semibold">Bundle validation</p>
            <p className="mt-1 text-xs">
              TLS material detected:{" "}
              <strong>{bundleValidation.tlsReady ? bundleValidation.tlsReady.toUpperCase() : "none"}</strong>
            </p>
            {bundleValidation.usedFiles.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-700">Used for storage</p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {bundleValidation.usedFiles.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {bundleValidation.filesScanned.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-700">Files scanned</p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-600">
                  {bundleValidation.filesScanned.join(", ")}
                </p>
              </div>
            )}
            {bundleValidation.missing.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-800">Missing / blocking</p>
                <ul className="mt-1 list-inside list-disc text-xs text-red-900">
                  {bundleValidation.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {bundleValidation.warnings.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-amber-900">Warnings</p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {bundleValidation.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {bundleValidation.ignored.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-600">Ignored (not used for mTLS)</p>
                <ul className="mt-1 max-h-28 overflow-y-auto font-mono text-[11px] text-slate-600">
                  {bundleValidation.ignored.map((i) => (
                    <li key={i.path}>
                      {i.path} — {i.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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
