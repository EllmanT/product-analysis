"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Minus, Plus, Server, Share2 } from "lucide-react";
import { toast } from "sonner";

import { useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBranch } from "@/lib/actions/branch.action";
import { AddBranchSchema } from "@/lib/validations";
import { cn } from "@/lib/utils";

const STEPS = ["Branch", "Fiscal device", "Tills", "Receipts"] as const;
const DONE = STEPS.length;

/** "Harare CBD" -> "HC", "Bulawayo" -> "BU". The admin can change it; the server enforces uniqueness. */
function suggestPrefix(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2);
  return words.map((w) => w[0]).join("").slice(0, 3);
}

interface Form {
  name: string;
  location: string;
  deviceChoice: "shared" | "own";
  deviceId: string;
  tills: number;
  offline: "limited" | "unlimited";
  offlineHours: string;
  prefix: string;
  prefixEdited: boolean;
  companyName: string;
  address: string;
  addressEdited: boolean;
  phone: string;
  tin: string;
}

const EMPTY: Form = {
  name: "",
  location: "",
  deviceChoice: "shared",
  deviceId: "",
  tills: 1,
  offline: "limited",
  offlineHours: "5",
  prefix: "",
  prefixEdited: false,
  companyName: "",
  address: "",
  addressEdited: false,
  phone: "",
  tin: "",
};

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Two big, obvious choices instead of a dropdown. */
function ChoiceCard({
  selected,
  disabled,
  onSelect,
  icon,
  title,
  body,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none",
        selected ? "border-amber-500 bg-amber-50" : "bg-background hover:border-foreground/30",
        disabled && "cursor-not-allowed opacity-50 active:scale-100"
      )}
    >
      <span className={cn("mt-0.5 rounded-md p-2", selected ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground")}>{icon}</span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

export default function AddBranchWizard({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; location?: string }>({});
  /** Set once the branch exists, so a retry after a failed later step never creates it twice. */
  const [branchId, setBranchId] = useState<string | null>(null);
  const [needsAttention, setNeedsAttention] = useState<string[]>([]);
  const { devices, loaded } = useFiscalDevices();
  const activeDevices = useMemo(() => devices.filter((d) => d.active), [devices]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function reset() {
    setStep(0);
    setForm(EMPTY);
    setBusy(false);
    setError(null);
    setFieldErrors({});
    setBranchId(null);
    setNeedsAttention([]);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (branchId) onCreated();
      // Wait for the close animation before clearing, so the content does not flash.
      setTimeout(reset, 200);
    }
  }

  function setName(name: string) {
    setForm((f) => ({ ...f, name, prefix: f.prefixEdited ? f.prefix : suggestPrefix(name) }));
  }
  function setLocation(location: string) {
    setForm((f) => ({ ...f, location, address: f.addressEdited ? f.address : location }));
  }

  function next() {
    setError(null);
    if (step === 0) {
      const r = AddBranchSchema.safeParse({ name: form.name, location: form.location });
      if (!r.success) {
        const flat = r.error.flatten().fieldErrors;
        setFieldErrors({ name: flat.name?.[0], location: flat.location?.[0] });
        return;
      }
      setFieldErrors({});
    }
    if (step === 1 && form.deviceChoice === "own" && !form.deviceId) {
      setError("Pick which device this branch should use.");
      return;
    }
    if (step === 2 && form.offline === "limited") {
      const h = Number(form.offlineHours);
      if (!Number.isFinite(h) || h < 0.25 || h > 720) {
        setError("Enter a number of hours between 0.25 and 720, or choose No limit.");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  async function create() {
    setError(null);
    if (!/^[A-Z0-9]{1,4}$/.test(form.prefix)) {
      setError("The receipt code must be 1 to 4 letters or numbers.");
      return;
    }
    setBusy(true);
    try {
      let id = branchId;
      if (!id) {
        const created = await addBranch({ name: form.name.trim(), location: form.location.trim() });
        const data = created.success ? (created.data as unknown as { _id?: string } | undefined) : undefined;
        if (!created.success || !data?._id) {
          setError("Could not create the branch. A branch with the same name and location may already exist.");
          setStep(0);
          return;
        }
        id = String(data._id);
        setBranchId(id);
      }

      const patch = await fetch(`/api/pos/branches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          invoicePrefix: form.prefix,
          offlineLimitHours: form.offline === "unlimited" ? null : Number(form.offlineHours),
          fiscalDeviceId: form.deviceChoice === "own" ? form.deviceId : null,
          receipt: {
            companyName: form.companyName.trim() || undefined,
            branchName: form.name.trim(),
            address: form.address.trim() || undefined,
            phone: form.phone.trim() || undefined,
            tin: form.tin.trim() || undefined,
          },
        }),
      });
      const pj = await patch.json().catch(() => null);
      if (!patch.ok || !pj?.success) {
        // The branch exists now; only this step needs fixing, so stay on it.
        setError(pj?.message ?? "Could not save the till settings.");
        return;
      }

      const attention: string[] = [];
      const tills = await fetch(`/api/pos/branches/${id}/tills`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: form.tills }),
      });
      if (!tills.ok) attention.push("Tills were not set up. Open POS settings and choose how many tills it has.");
      setNeedsAttention(attention);
      toast.success(`${form.name.trim()} is ready`);
      setStep(DONE);
    } finally {
      setBusy(false);
    }
  }

  const deviceName = form.deviceChoice === "own" ? (devices.find((d) => d.id === form.deviceId)?.name ?? "its own device") : "the shared device";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Add branch</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => busy && e.preventDefault()}>
        {step < DONE ? (
          <>
            <DialogHeader>
              <p className="text-xs font-medium text-muted-foreground">
                Step {step + 1} of {STEPS.length} · {STEPS[step]}
              </p>
              <div className="flex gap-1.5 pt-1" aria-hidden>
                {STEPS.map((s, i) => (
                  <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none", i <= step ? "bg-amber-500" : "bg-muted")} />
                ))}
              </div>
              <DialogTitle className="pt-2 text-lg">
                {step === 0 && "Name your branch"}
                {step === 1 && "Which fiscal device will it use?"}
                {step === 2 && "Tills and offline selling"}
                {step === 3 && "What goes on the receipt?"}
              </DialogTitle>
              <DialogDescription>
                {step === 0 && "You can change these later."}
                {step === 1 && "The fiscal device is what reports each sale to ZIMRA. Most branches share one."}
                {step === 2 && "Cashiers only ever see their till. Fiscal days open and close on their own."}
                {step === 3 && "We filled in what we could. Everything here is optional."}
              </DialogDescription>
            </DialogHeader>

            <div key={step} className="min-h-52 space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">
              {step === 0 && (
                <>
                  <Field label="Branch name" error={fieldErrors.name} hint="For example: Harare CBD or Branch 2">
                    <Input autoFocus value={form.name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
                  </Field>
                  <Field label="Town or suburb" error={fieldErrors.location}>
                    <Input value={form.location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
                  </Field>
                </>
              )}

              {step === 1 && (
                <div role="radiogroup" aria-label="Fiscal device" className="space-y-3">
                  <ChoiceCard
                    selected={form.deviceChoice === "shared"}
                    onSelect={() => set("deviceChoice", "shared")}
                    icon={<Share2 className="size-4" />}
                    title="Use the shared device"
                    body="Sales go through the same device as your other branches. This is the usual choice."
                  />
                  <ChoiceCard
                    selected={form.deviceChoice === "own"}
                    disabled={loaded && activeDevices.length === 0}
                    onSelect={() => set("deviceChoice", "own")}
                    icon={<Server className="size-4" />}
                    title="Give it its own device"
                    body={
                      loaded && activeDevices.length === 0
                        ? "You have no separate devices yet. Add one under Fiscal devices, then come back."
                        : "Sales are reported through a device used only by this branch."
                    }
                  />
                  {form.deviceChoice === "own" && activeDevices.length > 0 && (
                    <div className="space-y-1.5 pl-1">
                      <Label htmlFor="branch-device">Device</Label>
                      <select
                        id="branch-device"
                        value={form.deviceId}
                        onChange={(e) => set("deviceId", e.target.value)}
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      >
                        <option value="">Choose a device…</option>
                        {activeDevices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <>
                  <Field label="How many tills?" hint="A till is one checkout point. You can add more later.">
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="icon" aria-label="One fewer till" disabled={form.tills <= 1} onClick={() => set("tills", form.tills - 1)}>
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-8 text-center text-lg font-medium tabular-nums">{form.tills}</span>
                      <Button type="button" variant="outline" size="icon" aria-label="One more till" disabled={form.tills >= 20} onClick={() => set("tills", form.tills + 1)}>
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </Field>
                  <Field
                    label="If the internet or ZIMRA goes down"
                    hint="Sales carry on and are sent to ZIMRA automatically when it is back. Choose how long a till may keep selling without a connection to this system."
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant={form.offline === "limited" ? "default" : "outline"} aria-pressed={form.offline === "limited"} onClick={() => set("offline", "limited")}>
                        Up to
                      </Button>
                      <Input
                        className="w-20"
                        inputMode="decimal"
                        aria-label="Hours a till can sell offline"
                        disabled={form.offline !== "limited"}
                        value={form.offlineHours}
                        onChange={(e) => set("offlineHours", e.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">hours</span>
                      <span className="px-1 text-sm text-muted-foreground">or</span>
                      <Button type="button" variant={form.offline === "unlimited" ? "default" : "outline"} aria-pressed={form.offline === "unlimited"} onClick={() => set("offline", "unlimited")}>
                        No limit
                      </Button>
                    </div>
                  </Field>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Business name" hint="Printed at the top of the receipt.">
                      <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
                    </Field>
                    <Field label="Phone">
                      <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Address">
                    <Input
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value, addressEdited: true }))}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="TIN">
                      <Input value={form.tin} onChange={(e) => set("tin", e.target.value)} />
                    </Field>
                    <Field
                      label="Receipt code"
                      hint={`Receipts will be numbered like ${form.prefix || "HC"}U0001. Each branch needs its own code.`}
                    >
                      <Input
                        maxLength={4}
                        value={form.prefix}
                        onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""), prefixEdited: true }))}
                      />
                    </Field>
                  </div>
                </>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || busy || (branchId !== null && step === 3)}>
                <ChevronLeft className="size-4" /> Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button type="button" onClick={create} disabled={busy}>
                  {busy ? "Creating…" : "Create branch"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-5 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <DialogHeader>
              <DialogTitle className="text-lg">{form.name.trim()} is ready</DialogTitle>
              <DialogDescription>Here is what we set up. The last step is adding the people who will work there.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2.5 text-sm">
              {[
                `Branch created in ${form.location.trim()}`,
                "Point of sale switched on",
                `${form.tills} ${form.tills === 1 ? "till" : "tills"} ready`,
                `Reports to ZIMRA through ${deviceName}`,
                form.offline === "unlimited" ? "Tills keep selling offline with no time limit" : `Tills can sell offline for up to ${form.offlineHours} hours`,
                `Receipts numbered ${form.prefix}U0001, ${form.prefix}Z0001…`,
              ].map((line, i) => (
                <li key={line} className="flex items-start gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms`, animationDuration: "200ms" }}>
                  <span className="mt-0.5 grid size-4 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="size-3" />
                  </span>
                  {line}
                </li>
              ))}
              {needsAttention.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-amber-700">
                  <span className="mt-0.5 grid size-4 place-items-center rounded-full bg-amber-100 font-bold">!</span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button asChild>
                <Link href="/users">Add cashiers</Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
