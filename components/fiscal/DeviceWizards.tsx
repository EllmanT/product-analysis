"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, FileArchive, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FiscalDeviceSafe } from "@/lib/services/fiscalDevice.service";
import { ZIMRA_DEFAULT_TEST_BASE } from "@/lib/zimraConstants";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared calls. Each returns a plain message on failure so the UI can show it as is.
// ---------------------------------------------------------------------------

type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

/** A call that never answers must not leave the dialog on "Working…" for ever: give up and say so. */
async function api<T>(url: string, init: RequestInit, timeoutMs = 60_000): Promise<Result<T>> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return { ok: false, message: j?.message ?? `Something went wrong (${r.status}).` };
    return { ok: true, data: j as T };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return { ok: false, message: "This is taking too long, so we stopped waiting. Nothing is lost: use Try again." };
    }
    return { ok: false, message: "Could not reach the server. Check your connection and try again." };
  }
}

const createDevice = (body: Record<string, unknown>) =>
  api<{ data: FiscalDeviceSafe }>("/api/admin/fiscal-devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function uploadZip(id: string, file: File) {
  const form = new FormData();
  form.set("mode", "bundle_zip");
  form.set("bundle", file);
  return api<{ data: FiscalDeviceSafe }>(`/api/admin/fiscal-devices/${id}/certificates`, { method: "POST", body: form });
}

const registerWithKey = (id: string, input: { deviceId: string; serial: string; activationKey: string }) =>
  api<{ data: FiscalDeviceSafe }>(`/api/admin/fiscal-devices/${id}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", ...input }),
  });

// The server may spend up to ~50s logging in to and asking ZIMRA, so wait a little longer than that.
const checkConnection = (id: string) => api<{ data: { device: FiscalDeviceSafe } }>(`/api/admin/fiscal-devices/${id}/sync`, { method: "POST" }, 75_000);

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Choice({
  selected,
  onSelect,
  title,
  body,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none",
        selected ? "border-amber-500 bg-amber-50" : "bg-background hover:border-foreground/30"
      )}
    >
      {icon && <span className={cn("mt-0.5 rounded-md p-2", selected ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground")}>{icon}</span>}
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

/** Click or drop the zip ZIMRA sent. */
function ZipDrop({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      toast.error("That is not a .zip file. Use the zip ZIMRA sent you.");
      return;
    }
    onFile(f);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors duration-150 motion-reduce:transition-none",
        over ? "border-amber-500 bg-amber-50" : "bg-background",
        file && "border-solid border-emerald-300 bg-emerald-50/50"
      )}
    >
      <FileArchive className={cn("size-6", file ? "text-emerald-700" : "text-muted-foreground")} aria-hidden />
      {file ? (
        <p className="text-sm font-medium break-all">{file.name}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Drop the certificate zip here, or</p>
      )}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
        {file ? "Choose a different file" : "Choose file"}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".zip"
        className="sr-only"
        tabIndex={-1}
        aria-label="Certificate zip"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // Clear it so choosing the same file again still counts as a change.
          e.target.value = "";
        }}
      />
    </div>
  );
}

type StageState = "waiting" | "running" | "done" | "failed";

function Stages({ items }: { items: { label: string; state: StageState; note?: string }[] }) {
  return (
    <ul className="space-y-3" aria-live="polite">
      {items.map((s) => (
        <li key={s.label} className="flex items-start gap-3 text-sm">
          <span
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
              s.state === "done" && "bg-emerald-100 text-emerald-700",
              s.state === "running" && "bg-amber-100 text-amber-700",
              s.state === "failed" && "bg-red-100 text-red-700",
              s.state === "waiting" && "bg-muted text-muted-foreground"
            )}
          >
            {s.state === "done" && <Check className="size-3" />}
            {s.state === "running" && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />}
            {s.state === "failed" && <TriangleAlert className="size-3" />}
            {s.state === "waiting" && <span className="size-1.5 rounded-full bg-current" />}
          </span>
          <span className="space-y-0.5">
            <span className={cn("block", s.state === "waiting" && "text-muted-foreground")}>{s.label}</span>
            {s.note && <span className={cn("block text-xs", s.state === "failed" ? "text-destructive" : "text-muted-foreground")}>{s.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Add device
// ---------------------------------------------------------------------------

type Mode = "test" | "live";
type CertWay = "zip" | "key";

const STEP_TITLES = ["Name the device", "Add its certificate", "Connecting"] as const;

export function AddDeviceWizard({ onDone, backend = "legacy" }: { onDone: () => void; backend?: "legacy" | "service" }) {
  const viaService = backend === "service";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("test");
  const [address, setAddress] = useState("");
  const [way, setWay] = useState<CertWay>("zip");
  const [zip, setZip] = useState<File | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [serial, setSerial] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<FiscalDeviceSafe | null>(null);
  const [stages, setStages] = useState<Record<"device" | "cert" | "check", { state: StageState; note?: string }>>({
    device: { state: "waiting" },
    cert: { state: "waiting" },
    check: { state: "waiting" },
  });
  const [finished, setFinished] = useState<FiscalDeviceSafe | null>(null);
  /** Which stages are already complete, so "Try again" resumes instead of repeating them. */
  const doneRef = useRef({ cert: false });

  function reset() {
    setStep(0);
    setName("");
    setMode("test");
    setAddress("");
    setWay("zip");
    setZip(null);
    setDeviceId("");
    setSerial("");
    setActivationKey("");
    setError(null);
    setBusy(false);
    setCreated(null);
    setStages({ device: { state: "waiting" }, cert: { state: "waiting" }, check: { state: "waiting" } });
    setFinished(null);
    doneRef.current = { cert: false };
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (created) onDone();
      setTimeout(reset, 200);
    }
  }

  const mark = (k: "device" | "cert" | "check", state: StageState, note?: string) => setStages((s) => ({ ...s, [k]: { state, note } }));

  function next() {
    setError(null);
    if (step === 0) {
      if (!name.trim()) return setError("Give the device a name, for example Axis test 1.");
      if (address.trim() && !/^https?:\/\//i.test(address.trim())) return setError("The address must start with http:// or https://");
    }
    if (step === 1) {
      if (way === "zip" && !zip) return setError("Choose the certificate zip first.");
      if (way === "key") {
        if (!deviceId.trim() || !serial.trim() || !activationKey.trim()) return setError("Enter the device ID, serial number and activation key.");
      }
    }
    setStep((s) => s + 1);
    if (step === 1) void connect();
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      let dev = created;
      if (!dev) {
        mark("device", "running");
        const r = await createDevice({
          name: name.trim(),
          zimraApiUrl: address.trim() || ZIMRA_DEFAULT_TEST_BASE,
          zimraUseProductionUrl: mode === "live",
          // New devices open and close their fiscal day on their own. Change the times later in device settings.
          autoScheduleEnabled: true,
          autoOpenEnabled: true,
          autoCloseEnabled: true,
        });
        if (!r.ok) return mark("device", "failed", r.message);
        dev = r.data.data;
        setCreated(dev);
      }
      mark("device", "done", dev.name);

      if (!doneRef.current.cert) {
        mark("cert", "running");
        const r = zip && way === "zip" ? await uploadZip(dev.id, zip) : await registerWithKey(dev.id, { deviceId: deviceId.trim(), serial: serial.trim(), activationKey: activationKey.trim() });
        if (!r.ok) return mark("cert", "failed", r.message);
        doneRef.current.cert = true;
      }
      mark("cert", "done");

      mark("check", "running");
      const c = await checkConnection(dev.id);
      if (!c.ok) {
        return mark("check", "failed", `${c.message} The device is saved. You can try again, or close this and finish later.`);
      }
      const d = c.data.data.device;
      mark("check", "done", d.deviceId ? `Device ${d.deviceId}${d.deviceSerialNumber ? ` · serial ${d.deviceSerialNumber}` : ""}` : undefined);
      setFinished(d);
      toast.success(`${d.name} is connected`);
    } finally {
      setBusy(false);
    }
  }

  const failed = Object.values(stages).some((s) => s.state === "failed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Add device</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEP_TITLES.length}
          </p>
          <div className="flex gap-1.5 pt-1" aria-hidden>
            {STEP_TITLES.map((s, i) => (
              <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none", i <= step ? "bg-amber-500" : "bg-muted")} />
            ))}
          </div>
          <DialogTitle className="pt-2 text-lg">{finished ? `${finished.name} is connected` : STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>
            {step === 0 && "A fiscal device reports each sale to ZIMRA. Give it a name you will recognise."}
            {step === 1 && "Use whichever ZIMRA gave you. You only need one."}
            {step === 2 && !finished && "We are setting it up and checking it can talk to ZIMRA."}
            {finished && "It is ready. Next, choose which branches should use it."}
          </DialogDescription>
        </DialogHeader>

        <div key={step} className="min-h-48 space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dev-name">Name</Label>
                <Input id="dev-name" autoFocus value={name} placeholder="Axis test 1" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
              </div>
              <div role="radiogroup" aria-label="Which ZIMRA system" className="grid gap-3 sm:grid-cols-2">
                <Choice selected={mode === "test"} onSelect={() => setMode("test")} title="Test device" body="Sends to the ZIMRA test system. Nothing here is real tax data." />
                <Choice selected={mode === "live"} onSelect={() => setMode("live")} title="Live device" body="Sends to the real ZIMRA system. Use this for a client going live." />
              </div>
              {!viaService && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Use a different ZIMRA address</summary>
                <div className="space-y-1.5 pt-3">
                  <Input aria-label="ZIMRA address" value={address} placeholder={ZIMRA_DEFAULT_TEST_BASE} onChange={(e) => setAddress(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Leave blank to use the standard ZIMRA address.</p>
                </div>
              </details>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div role="radiogroup" aria-label="How to add the certificate" className="grid gap-3 sm:grid-cols-2">
                <Choice selected={way === "zip"} onSelect={() => setWay("zip")} icon={<FileArchive className="size-4" />} title="I have the zip" body="The certificate file ZIMRA sent." />
                {!viaService && <Choice selected={way === "key"} onSelect={() => setWay("key")} icon={<KeyRound className="size-4" />} title="I have an activation key" body="We register the device and fetch its certificate." />}
              </div>
              {way === "zip" ? (
                <ZipDrop file={zip} onFile={setZip} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="dev-id">Device ID</Label>
                    <Input id="dev-id" inputMode="numeric" maxLength={12} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dev-serial">Serial number</Label>
                    <Input id="dev-serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="dev-key">Activation key</Label>
                    <Input id="dev-key" autoComplete="off" maxLength={32} value={activationKey} onChange={(e) => setActivationKey(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Used once to register. We never store it.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <Stages
              items={[
                { label: "Saving the device", state: stages.device.state, note: stages.device.note },
                { label: viaService ? "Sending the certificate to ZIMRA to check it" : way === "zip" ? "Installing the certificate" : "Registering with ZIMRA", state: stages.cert.state, note: stages.cert.note },
                { label: "Checking the connection to ZIMRA", state: stages.check.state, note: stages.check.note },
              ]}
            />
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          {step === 2 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={busy || !!finished}>
              <ChevronLeft className="size-4" /> Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <ChevronLeft className="size-4" /> Back
            </Button>
          )}
          {step < 2 && <Button onClick={next}>Continue</Button>}
          {step === 2 && finished && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button asChild>
                <Link href="/pos-settings">Choose branches</Link>
              </Button>
            </div>
          )}
          {step === 2 && !finished && failed && (
            <Button onClick={() => void connect()} disabled={busy}>
              Try again
            </Button>
          )}
          {step === 2 && !finished && !failed && (
            <Button disabled>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Working…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New certificate for a device that already exists
// ---------------------------------------------------------------------------

export function ReplaceCertificateDialog({ device, onDone }: { device: FiscalDeviceSafe; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [zip, setZip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalDeviceSafe | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (result) onDone();
      setTimeout(() => {
        setZip(null);
        setError(null);
        setResult(null);
        setWarn(null);
      }, 200);
    }
  }

  async function install() {
    if (!zip) return setError("Choose the certificate zip first.");
    setBusy(true);
    setError(null);
    setWarn(null);
    try {
      const up = await uploadZip(device.id, zip);
      if (!up.ok) return setError(up.message);
      setResult(up.data.data);
      // Prove the new certificate works. A failure here is a warning, not a rollback: the certificate is installed.
      const c = await checkConnection(device.id);
      if (!c.ok) setWarn(`The certificate was installed, but the connection check failed: ${c.message}`);
      else setResult(c.data.data.device);
      toast.success("Certificate replaced");
    } finally {
      setBusy(false);
    }
  }

  const hasCert = device.hasClientCert || device.hasPfx;
  const until = formatDate(device.certNotAfter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {hasCert ? "New certificate" : "Add certificate"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-lg">{hasCert ? "Replace the certificate" : "Add a certificate"}</DialogTitle>
          <DialogDescription>
            {device.name}
            {hasCert && until ? ` · current certificate valid until ${until}` : ""}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <Stages
              items={[
                { label: "New certificate installed", state: "done", note: formatDate(result.certNotAfter) ? `Valid until ${formatDate(result.certNotAfter)}` : undefined },
                warn ? { label: "Connection check", state: "failed", note: warn } : { label: "Connection to ZIMRA checked", state: "done" },
              ]}
            />
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ZipDrop file={zip} onFile={setZip} disabled={busy} />
            {hasCert && <p className="text-xs text-muted-foreground">The new certificate takes over straight away. Use the zip ZIMRA sent for this same device.</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void install()} disabled={busy || !zip}>
                {busy ? "Installing…" : "Install certificate"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Choose the central device
// ---------------------------------------------------------------------------

/** Make this device the central one: shop invoices and every branch without its own device use it. */
export function MakeCentralDialog({ device, onDone }: { device: FiscalDeviceSafe; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await api("/api/admin/fiscal-devices/central", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      });
      if (!r.ok) return setError(r.message);
      toast.success(`${device.name} is now the central device`);
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(device.serviceDeviceId) && device.active;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={!ready} title={ready ? undefined : "Add its certificate first, and switch it on"}>
          Make central
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-lg">Make {device.name} the central device?</DialogTitle>
          <DialogDescription>
            The shop and every branch that has no device of its own will send their receipts through {device.name}. The current central device must have its fiscal day closed and no sales waiting.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />} Make central
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
