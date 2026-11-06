"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import RegisterDevicePanel from "@/components/fiscal/RegisterDevicePanel";
import { AddDeviceWizard, ReplaceCertificateDialog } from "@/components/fiscal/DeviceWizards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CertBundleValidation } from "@/lib/fiscalCertBundle";
import type { FiscalDeviceSafe } from "@/lib/services/fiscalDevice.service";

/**
 * The central device is edited with the very same screen as a branch device. Only where it saves to differs, and
 * which fields apply (it has no name, no switch, no virtual-device login: those come from the server's settings).
 */
export const CENTRAL_ID = "central";

export function deviceApi(d: { id: string }) {
  const central = d.id === CENTRAL_ID;
  const base = central ? "/api/admin/fiscal-settings" : `/api/admin/fiscal-devices/${d.id}`;
  return {
    central,
    base,
    certificates: `${base}/certificates`,
    register: `${base}/register`,
    renew: `${base}/renew`,
    sync: central ? `${base}/sync-device` : `${base}/sync`,
  };
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Api<T = unknown> = { success: boolean; message?: string; data?: T };

async function call<T = unknown>(url: string, init?: RequestInit): Promise<Api<T>> {
  try {
    const r = await fetch(url, init);
    const j = (await r.json().catch(() => null)) as Api<T> | null;
    return j ?? { success: false, message: `Request failed (${r.status})` };
  } catch {
    return { success: false, message: "Network error" };
  }
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const selectClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-900",
    danger: "bg-red-100 text-red-800",
    muted: "bg-slate-100 text-slate-600",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function CertChip({ d }: { d: FiscalDeviceSafe }) {
  if (!d.hasClientCert && !d.hasPfx) return <Chip tone="muted">No certificate</Chip>;
  if (d.certExpiryStatus === "expired") return <Chip tone="danger">Expired</Chip>;
  const days = d.certDaysLeft !== null ? `${d.certDaysLeft} day${d.certDaysLeft === 1 ? "" : "s"} left` : "Valid";
  if (d.certExpiryStatus === "critical") return <Chip tone="danger">{days}</Chip>;
  if (d.certExpiryStatus === "warning") return <Chip tone="warn">{days}</Chip>;
  return <Chip tone="ok">{days}</Chip>;
}

// ---------------------------------------------------------------------------

interface Form {
  name: string;
  active: boolean;
  zimraApiUrl: string;
  zimraUseProductionUrl: boolean;
  deviceId: string;
  deviceSerialNumber: string;
  vdEmail: string;
  /** Typed password; empty keeps the stored one. */
  vdPassword: string;
  clearVdPassword: boolean;
  serviceDeviceId: string;
  deviceModelName: string;
  deviceModelVersion: string;
  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  closeTime: string;
  openTime: string;
  timezone: string;
  closeWeekdays: number[];
  openWeekdays: number[];
}

const blankForm: Form = {
  name: "",
  active: true,
  zimraApiUrl: "",
  zimraUseProductionUrl: false,
  deviceId: "",
  deviceSerialNumber: "",
  vdEmail: "",
  vdPassword: "",
  clearVdPassword: false,
  serviceDeviceId: "",
  deviceModelName: "",
  deviceModelVersion: "",
  autoScheduleEnabled: false,
  autoCloseEnabled: false,
  autoOpenEnabled: false,
  closeTime: "00:00",
  openTime: "00:05",
  timezone: "Africa/Harare",
  closeWeekdays: ALL_DAYS,
  openWeekdays: ALL_DAYS,
};

const toForm = (d: FiscalDeviceSafe): Form => ({
  name: d.name,
  active: d.active,
  zimraApiUrl: d.zimraApiUrl ?? "",
  zimraUseProductionUrl: d.zimraUseProductionUrl,
  deviceId: d.deviceId ?? "",
  deviceSerialNumber: d.deviceSerialNumber ?? "",
  vdEmail: d.vdEmail ?? "",
  vdPassword: "",
  clearVdPassword: false,
  serviceDeviceId: d.serviceDeviceId ?? "",
  deviceModelName: d.deviceModelName ?? "",
  deviceModelVersion: d.deviceModelVersion ?? "",
  autoScheduleEnabled: d.autoScheduleEnabled,
  autoCloseEnabled: d.autoCloseEnabled,
  autoOpenEnabled: d.autoOpenEnabled,
  closeTime: d.closeTime,
  openTime: d.openTime,
  timezone: d.timezone,
  closeWeekdays: d.closeWeekdays?.length ? d.closeWeekdays : ALL_DAYS,
  openWeekdays: d.openWeekdays?.length ? d.openWeekdays : ALL_DAYS,
});

export function DeviceEditor({
  device,
  encryptionConfigured,
  onSaved,
  onClose,
  onDeleted,
}: {
  device: FiscalDeviceSafe | null;
  encryptionConfigured: boolean;
  onSaved: (id: string) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<Form>(() => (device ? toForm(device) : blankForm));
  const [busy, setBusy] = useState<"" | "save" | "sync" | "delete">("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const api = device ? deviceApi(device) : null;
  const central = !!api?.central;

  async function save() {
    setBusy("save");
    setError("");
    // What both kinds of device have.
    const shared = {
      zimraApiUrl: form.zimraApiUrl.trim() || null,
      zimraUseProductionUrl: form.zimraUseProductionUrl,
      deviceId: form.deviceId.trim() || null,
      deviceSerialNumber: form.deviceSerialNumber.trim() || null,
      autoScheduleEnabled: form.autoScheduleEnabled,
      autoCloseEnabled: form.autoCloseEnabled,
      autoOpenEnabled: form.autoOpenEnabled,
      closeTime: form.closeTime,
      openTime: form.openTime,
      timezone: form.timezone.trim() || "Africa/Harare",
      closeWeekdays: form.closeWeekdays,
      openWeekdays: form.openWeekdays,
    };
    // A branch device also has a name, an on/off switch, a virtual-device login and a service id.
    const body = central
      ? shared
      : {
          ...shared,
          name: form.name,
          active: form.active,
          vdEmail: form.vdEmail.trim() || null,
          serviceDeviceId: form.serviceDeviceId.trim() || null,
          deviceModelName: form.deviceModelName.trim() || null,
          deviceModelVersion: form.deviceModelVersion.trim() || null,
          ...(form.clearVdPassword ? { vdPassword: null } : form.vdPassword ? { vdPassword: form.vdPassword } : {}),
        };
    const res = await call<FiscalDeviceSafe>(api ? api.base : "/api/admin/fiscal-devices", jsonInit(api ? "PATCH" : "POST", body));
    setBusy("");
    if (!res.success) return setError(res.message ?? "Could not save");
    toast.success(central ? "Settings saved" : device ? "Device saved" : "Device added");
    onSaved(res.data?.id ?? device?.id ?? CENTRAL_ID);
  }

  async function sync() {
    if (!device || !api) return;
    setBusy("sync");
    setError("");
    const res = await call(api.sync, { method: "POST" });
    setBusy("");
    if (!res.success) return setError(res.message ?? "Could not read the device");
    toast.success("Device ID and serial read from the device");
    onSaved(device.id);
  }

  async function remove() {
    if (!device) return;
    setBusy("delete");
    setError("");
    const res = await call(`/api/admin/fiscal-devices/${device.id}`, { method: "DELETE" });
    setBusy("");
    setConfirmDelete(false);
    if (!res.success) return setError(res.message ?? "Could not delete");
    toast.success("Device deleted");
    onDeleted();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-background p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium">{central ? "Central device" : device ? device.name : "New device"}</h2>
            <p className="text-sm text-muted-foreground">
              {central
                ? "The device every branch uses unless it has its own. Its fiscal day, receipt counters and certificate are shared by those branches."
                : "Its own Virtual Device: fiscal day, receipt counters, certificate and login are separate from every other device."}
            </p>
          </div>
          {!central && (
            <div className="flex items-center gap-2">
              <Label htmlFor="dev-active" className="text-sm">
                Active
              </Label>
              <Switch id="dev-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {!central && (
            <Field label="Name" htmlFor="dev-name" hint="Shown on Z-reports and in lists, e.g. Bulawayo till device.">
              <Input id="dev-name" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
            </Field>
          )}
          <Field
            label={central ? "ZIMRA address (optional)" : "Virtual Device URL"}
            htmlFor="dev-url"
            hint={
              central
                ? `Leave blank for ${device?.effectiveZimraUrl ?? "the standard ZIMRA test address"}.`
                : "Must differ from the central device and every other device."
            }
          >
            <Input id="dev-url" value={form.zimraApiUrl} placeholder={central ? (device?.effectiveZimraUrl ?? "") : "http://host:10005"} onChange={(e) => set("zimraApiUrl", e.target.value)} />
          </Field>
          <Field label="Device ID" htmlFor="dev-id" hint={device ? undefined : "Can be read from the device after saving."}>
            <Input id="dev-id" inputMode="numeric" value={form.deviceId} onChange={(e) => set("deviceId", e.target.value)} />
          </Field>
          <Field label="Serial number" htmlFor="dev-serial">
            <Input id="dev-serial" value={form.deviceSerialNumber} onChange={(e) => set("deviceSerialNumber", e.target.value)} />
          </Field>
          {!central && (
          <Field label="Device login (email)" htmlFor="dev-email" hint="Only if this Virtual Device asks for a login.">
            <Input id="dev-email" autoComplete="off" value={form.vdEmail} onChange={(e) => set("vdEmail", e.target.value)} />
          </Field>
          )}
          {!central && (
          <Field
            label="Device login (password)"
            htmlFor="dev-pass"
            hint={
              !encryptionConfigured
                ? "Set FISCAL_ENCRYPTION_KEY on the server first; passwords are stored encrypted."
                : device?.hasVdPassword
                  ? "A password is stored. Leave blank to keep it."
                  : undefined
            }
          >
            <Input
              id="dev-pass"
              type="password"
              autoComplete="new-password"
              value={form.vdPassword}
              disabled={form.clearVdPassword}
              onChange={(e) => set("vdPassword", e.target.value)}
            />
            {device?.hasVdPassword && (
              <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={form.clearVdPassword} onChange={(e) => set("clearVdPassword", e.target.checked)} />
                Remove the stored password
              </label>
            )}
          </Field>
          )}
        </div>
        {!central && (
        <Field label="Fiscal service device id" htmlFor="dev-svc" hint="Only when the app runs with FISCAL_BACKEND=service: the id the fiscal service gave this device after its certificate was uploaded there.">
          <Input id="dev-svc" value={form.serviceDeviceId} onChange={(e) => set("serviceDeviceId", e.target.value)} placeholder="24 character id" />
        </Field>
        )}
        {!central && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Advanced: ZIMRA model headers</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Model name" htmlFor="dev-model" hint="Only if ZIMRA registered this device under a different model. Default: Server.">
              <Input id="dev-model" value={form.deviceModelName} onChange={(e) => set("deviceModelName", e.target.value)} />
            </Field>
            <Field label="Model version" htmlFor="dev-model-v" hint="Default: v1.">
              <Input id="dev-model-v" value={form.deviceModelVersion} onChange={(e) => set("deviceModelVersion", e.target.value)} />
            </Field>
          </div>
        </details>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.zimraUseProductionUrl} onChange={(e) => set("zimraUseProductionUrl", e.target.checked)} />
          Production host (removes “test” from the URL host name)
        </label>
        {device?.effectiveZimraUrl && (
          <p className="text-xs text-muted-foreground">
            Calls go to <span className="font-mono">{device.effectiveZimraUrl}</span>
          </p>
        )}
        {device && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => void sync()} disabled={busy !== ""}>
              {busy === "sync" ? "Reading…" : "Read ID and serial from device"}
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-background p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium">Automatic open and close</h2>
            <p className="text-sm text-muted-foreground">This device opens and closes its own fiscal day on this schedule.</p>
          </div>
          <Switch checked={form.autoScheduleEnabled} onCheckedChange={(v) => set("autoScheduleEnabled", v)} aria-label="Automatic schedule" />
        </div>
        {form.autoScheduleEnabled && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Open at" htmlFor="dev-open">
              <div className="flex items-center gap-2">
                <Switch checked={form.autoOpenEnabled} onCheckedChange={(v) => set("autoOpenEnabled", v)} aria-label="Open automatically" />
                <Input id="dev-open" type="time" value={form.openTime} onChange={(e) => set("openTime", e.target.value)} />
              </div>
            </Field>
            <Field label="Close at" htmlFor="dev-close" hint="Held back while this device has unfiscalised sales.">
              <div className="flex items-center gap-2">
                <Switch checked={form.autoCloseEnabled} onCheckedChange={(v) => set("autoCloseEnabled", v)} aria-label="Close automatically" />
                <Input id="dev-close" type="time" value={form.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
              </div>
            </Field>
            <Field label="Time zone" htmlFor="dev-tz">
              <Input id="dev-tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </Field>
            <Weekdays label="Opens on" days={form.openWeekdays} onChange={(d) => set("openWeekdays", d)} />
            <Weekdays label="Closes on" days={form.closeWeekdays} onChange={(d) => set("closeWeekdays", d)} />
          </div>
        )}
      </section>

      {device ? (
        <CertificatePanel device={device} encryptionConfigured={encryptionConfigured} onChanged={() => onSaved(device.id)} />
      ) : (
        <p className="text-sm text-muted-foreground">Save the device first, then upload its certificate.</p>
      )}

      {device && (
        <section className="space-y-2 rounded-xl border bg-background p-5">
          <h2 className="font-medium">{central ? "Branches using the central device" : "Branches using this device"}</h2>
          {device.branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {central ? "None. Every branch has its own device. Change that under " : "None yet. Choose this device for a branch under "}{" "}
              <Link href="/pos-settings" className="underline underline-offset-2">
                POS settings
              </Link>
              .
            </p>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {device.branches.map((b) => (
                <li key={b.id}>{b.name}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={busy !== "" || (!central && !form.name.trim())}>
          {busy === "save" ? "Saving…" : central ? "Save settings" : device ? "Save device" : "Add device"}
        </Button>
        {!central && (
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
        {device && !central && !confirmDelete && (
          <Button type="button" variant="ghost" className="ml-auto text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            Delete device
          </Button>
        )}
        {device && !central && confirmDelete && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            Delete “{device.name}”?
            <Button type="button" size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => void remove()} disabled={busy !== ""}>
              {busy === "delete" ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </span>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Weekdays({ label, days, onChange }: { label: string; days: number[]; onChange: (d: number[]) => void }) {
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    onChange(next.length ? next : [d]); // at least one day
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {DAY_NAMES.map((n, i) => (
          <button
            key={n}
            type="button"
            aria-pressed={days.includes(i + 1)}
            onClick={() => toggle(i + 1)}
            className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${
              days.includes(i + 1) ? "border-amber-500 bg-amber-50 text-amber-900" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </Field>
  );
}

function BundleReport({ v }: { v: CertBundleValidation }) {
  const list = (title: string, items: readonly string[], tone = "") =>
    items.length > 0 && (
      <div>
        <p className={`font-medium ${tone}`}>{title}</p>
        <ul className="list-disc pl-5 text-xs">
          {items.map((x) => (
            <li key={x} className="break-all">
              {x}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
      {list("Will be used", v.usedFiles as readonly string[])}
      {list("Missing", v.missing as readonly string[], "text-destructive")}
      {list("Worth a look", v.warnings as readonly string[], "text-amber-800")}
      {list("Ignored", v.ignored.map((i) => `${i.path} (${i.reason})`))}
      {v.tlsReady !== null && <p className="text-xs text-muted-foreground">{v.tlsReady ? "A certificate and key were found." : "No usable certificate and key were found."}</p>}
    </div>
  );
}

type CertMode = "bundle_zip" | "bundle_folder" | "pem" | "pfx";

function CertificatePanel({
  device,
  encryptionConfigured,
  onChanged,
}: {
  device: FiscalDeviceSafe;
  encryptionConfigured: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<CertMode>("bundle_zip");
  const [files, setFiles] = useState<{ bundle?: File; cert?: File; key?: File; pfx?: File }>({});
  const [folder, setFolder] = useState<File[]>([]);
  const [report, setReport] = useState<CertBundleValidation | null>(null);
  const api = deviceApi(device);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [error, setError] = useState("");

  const hasCert = device.hasClientCert || device.hasPfx;

  async function renewNow() {
    setRenewing(true);
    setConfirmRenew(false);
    setError("");
    const res = await call(api.renew, { method: "POST" });
    setRenewing(false);
    if (!res.success) {
      setError(res.message ?? "Renewal failed");
      onChanged();
      return;
    }
    toast.success("Certificate renewed");
    onChanged();
  }

  async function setAutoRenew(v: boolean) {
    const res = await call(api.base, jsonInit("PATCH", { autoRenewCertificate: v }));
    if (!res.success) return setError(res.message ?? "Could not change the setting");
    onChanged();
  }
  const ready =
    (mode === "bundle_zip" && files.bundle) ||
    (mode === "bundle_folder" && folder.length > 0) ||
    (mode === "pem" && files.cert && files.key) ||
    (mode === "pfx" && files.pfx);

  async function post(form: FormData, done: string) {
    setBusy(true);
    setError("");
    const res = (await call(api.certificates, { method: "POST", body: form })) as Api & { validation?: CertBundleValidation; storable?: boolean };
    setBusy(false);
    if (res.validation) setReport(res.validation);
    if (!res.success) return setError(res.message ?? "Upload failed");
    if (form.get("dryRun") === "true") {
      toast[res.storable ? "success" : "warning"](res.storable ? "The files look complete. Upload them when ready." : "The files are incomplete. See the details below.");
      return;
    }
    setFiles({});
    setFolder([]);
    setReport(null);
    setPassphrase("");
    toast.success(done);
    onChanged();
  }

  function upload(dryRun = false) {
    const f = new FormData();
    f.set("mode", mode);
    if (dryRun) f.set("dryRun", "true");
    if (mode === "bundle_zip" && files.bundle) {
      f.set("bundle", files.bundle);
      f.set("passphrase", passphrase);
    }
    if (mode === "bundle_folder") {
      for (const file of folder) f.append("files", file);
      f.set("passphrase", passphrase);
    }
    if (mode === "pem" && files.cert && files.key) {
      f.set("cert", files.cert);
      f.set("key", files.key);
    }
    if (mode === "pfx" && files.pfx) {
      f.set("pfx", files.pfx);
      f.set("passphrase", passphrase);
    }
    void post(f, dryRun ? "Checked" : "Certificate saved");
  }

  function remove(kind: "clear_pem" | "clear_pfx") {
    const f = new FormData();
    f.set("mode", kind);
    void post(f, "Certificate removed");
  }

  const tone =
    device.certExpiryStatus === "expired" || device.certExpiryStatus === "critical"
      ? "border-red-300 bg-red-50 text-red-900"
      : device.certExpiryStatus === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <section className="space-y-4 rounded-xl border bg-background p-5">
      <div>
        <h2 className="font-medium">Certificate</h2>
        <p className="text-sm text-muted-foreground">The private key is encrypted before it is stored and is never shown again.</p>
      </div>

      {!encryptionConfigured && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          FISCAL_ENCRYPTION_KEY is not set on the server, so a certificate cannot be saved yet.
        </p>
      )}

      {hasCert && (
        <dl className={`grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm ${tone}`}>
          <dt className="font-medium">Expires</dt>
          <dd>
            {device.certNotAfter ? device.certNotAfter.slice(0, 10) : "unknown"}
            {device.certDaysLeft !== null && (device.certDaysLeft < 0 ? " (expired)" : ` (${device.certDaysLeft} days left)`)}
          </dd>
          <dt className="font-medium">Subject</dt>
          <dd className="break-all">{device.certSubject ?? "unknown"}</dd>
          <dt className="font-medium">Serial</dt>
          <dd className="break-all font-mono text-xs">{device.certSerial ?? "unknown"}</dd>
          <dt className="font-medium">Private key</dt>
          <dd>{device.secretsEncrypted ? "stored encrypted" : "stored UNENCRYPTED. Run npm run fiscal:encrypt -- --apply"}</dd>
        </dl>
      )}

      {(!hasCert || device.certExpiryStatus === "expired") && (
        <RegisterDevicePanel
          endpoint={api.register}
          initialDeviceId={device.deviceId}
          initialSerial={device.deviceSerialNumber}
          pending={device.renewalPending}
          encryptionConfigured={encryptionConfigured}
          expired={hasCert}
          onDone={onChanged}
        />
      )}

      {device.hasClientCert && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Renew automatically</p>
              <p className="text-xs text-muted-foreground">
                30 days before it expires the system asks ZIMRA for a new certificate, tests it, and only then switches over.
                ZIMRA cancels the old certificate the moment it issues the new one, so turn this on only if nothing else (such as the Virtual Device) keeps its own copy.
              </p>
            </div>
            <Switch checked={device.autoRenewCertificate} onCheckedChange={(v) => void setAutoRenew(v)} aria-label="Renew automatically" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirmRenew) void renewNow();
                else setConfirmRenew(true);
              }}
              disabled={renewing || busy || !encryptionConfigured}
            >
              {renewing ? "Renewing…" : confirmRenew ? "Yes, renew now" : device.renewalPending ? "Finish pending renewal" : "Renew now"}
            </Button>
            {confirmRenew && !renewing && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRenew(false)}>
                  Cancel
                </Button>
                <span className="text-xs text-amber-800">The current certificate stops working immediately. Anything else using it must be given the new one.</span>
              </>
            )}
            {device.lastRenewalAt && (
              <span className="text-xs text-muted-foreground">Last renewed {device.lastRenewalAt.slice(0, 10)}</span>
            )}
          </div>
          {device.renewalPending && (
            <p className="text-xs text-amber-800">
              ZIMRA has issued a new certificate that is waiting to be tested. The current one stays in use until then.
            </p>
          )}
          {device.lastRenewalError && (
            <p className="text-xs text-destructive" role="alert">
              Last renewal attempt failed: {device.lastRenewalError}
            </p>
          )}
        </div>
      )}
      {device.hasPfx && !device.hasClientCert && (
        <p className="text-xs text-muted-foreground">Automatic renewal needs the certificate stored as a certificate + key pair, not a PFX.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={hasCert ? "Replace with" : "Upload"} htmlFor="cert-mode">
          <select id="cert-mode" value={mode} onChange={(e) => setMode(e.target.value as CertMode)} className={selectClass}>
            <option value="bundle_zip">ZIMRA zip (finds the certificate and key)</option>
            <option value="bundle_folder">Folder of certificate files</option>
            <option value="pem">Certificate + key (PEM)</option>
            <option value="pfx">PFX file</option>
          </select>
        </Field>
        {mode === "bundle_zip" && (
          <Field label="Zip file" htmlFor="cert-zip" hint="The zip ZIMRA gave you, e.g. certificates_31591.zip.">
            <Input id="cert-zip" type="file" accept=".zip" onChange={(e) => setFiles({ bundle: e.target.files?.[0] })} />
          </Field>
        )}
        {mode === "bundle_folder" && (
          <Field label="Folder" htmlFor="cert-folder" hint={folder.length ? `${folder.length} files selected.` : "Choose the folder ZIMRA gave you, e.g. certificates_31591."}>
            <input
              id="cert-folder"
              type="file"
              multiple
              // @ts-expect-error webkitdirectory is a non-standard attribute that every major browser supports
              webkitdirectory=""
              className="block w-full text-sm"
              onChange={(e) => setFolder(Array.from(e.target.files ?? []))}
            />
          </Field>
        )}
        {mode === "pem" && (
          <>
            <Field label="Certificate file" htmlFor="cert-crt">
              <Input id="cert-crt" type="file" accept=".crt,.pem,.cer" onChange={(e) => setFiles((f) => ({ ...f, cert: e.target.files?.[0] }))} />
            </Field>
            <Field label="Private key file" htmlFor="cert-key">
              <Input id="cert-key" type="file" accept=".key,.pem" onChange={(e) => setFiles((f) => ({ ...f, key: e.target.files?.[0] }))} />
            </Field>
          </>
        )}
        {mode === "pfx" && (
          <Field label="PFX file" htmlFor="cert-pfx">
            <Input id="cert-pfx" type="file" accept=".pfx,.p12" onChange={(e) => setFiles({ pfx: e.target.files?.[0] })} />
          </Field>
        )}
        {(mode === "pfx" || mode === "bundle_zip" || mode === "bundle_folder") && (
          <Field label="PFX passphrase" htmlFor="cert-pass" hint={mode !== "pfx" ? "Only needed if it contains a PFX." : undefined}>
            <Input id="cert-pass" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {(mode === "bundle_zip" || mode === "bundle_folder") && (
          <Button type="button" variant="outline" onClick={() => upload(true)} disabled={busy || !ready}>
            Check the files first
          </Button>
        )}
        <Button type="button" onClick={() => upload()} disabled={busy || !ready || !encryptionConfigured}>
          {busy ? "Saving…" : hasCert ? "Replace certificate" : "Upload certificate"}
        </Button>
        {device.hasClientCert && (
          <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => remove("clear_pem")} disabled={busy}>
            Remove certificate
          </Button>
        )}
        {device.hasPfx && (
          <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => remove("clear_pfx")} disabled={busy}>
            Remove PFX
          </Button>
        )}
      </div>
      {report && <BundleReport v={report} />}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export default function FiscalDevicesManager() {
  const [reloadKey, setReloadKey] = useState(0);
  const { devices, loaded, encryptionConfigured } = useFiscalDevices(reloadKey);
  // null = list only, otherwise the id of the device whose advanced settings are open.
  const [openId, setOpenId] = useState<string | null>(null);
  const reload = () => setReloadKey((n) => n + 1);

  const open = openId ? devices.find((d) => d.id === openId) : undefined;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Fiscal devices</h1>
          <p className="text-sm text-muted-foreground">
            Branches use the central device by default. Add a device here, then pick it for a branch in POS settings so that branch has its own fiscal day and certificate.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/fiscal-settings">Central device settings</Link>
          </Button>
          <AddDeviceWizard onDone={reload} />
        </div>
      </div>

      {!encryptionConfigured && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>FISCAL_ENCRYPTION_KEY is not set on the server.</strong> Certificates and device passwords cannot be saved until it is.
        </p>
      )}

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No separate devices yet. Every branch uses the central device. Use Add device when a branch needs its own, or when you are setting up a client&apos;s test device.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Device ID</th>
                <th className="px-4 py-3">Branches</th>
                <th className="px-4 py-3">Certificate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className={`border-b last:border-0 ${openId === d.id ? "bg-slate-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{d.name}</div>
                    <div className="max-w-64 truncate text-xs text-muted-foreground">{d.effectiveZimraUrl ?? "No URL set"}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{d.deviceId ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{d.branches.length ? d.branches.map((b) => b.name).join(", ") : "—"}</td>
                  <td className="px-4 py-3">
                    <CertChip d={d} />
                  </td>
                  <td className="px-4 py-3">{d.active ? <Chip tone="ok">Active</Chip> : <Chip tone="muted">Off</Chip>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <ReplaceCertificateDialog device={d} onDone={reload} />
                      <Button variant="outline" size="sm" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                        {openId === d.id ? "Close" : "Settings"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <DeviceEditor
          // Remount whenever the saved device changes so the form shows what is stored.
          key={`${open.id}:${open.certSerial}:${open.deviceId}:${open.hasVdPassword}`}
          device={open}
          encryptionConfigured={encryptionConfigured}
          onSaved={() => reload()}
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            reload();
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
