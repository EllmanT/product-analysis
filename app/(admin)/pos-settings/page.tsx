"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CENTRAL, useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import { TillsPanel } from "@/components/pos/TillsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { printSlip } from "@/lib/pos/print";
import type { PosBranchDto } from "@/lib/services/posBranch.service";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function patchBranch(id: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await fetch(`/api/pos/branches/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return r.ok && j?.success ? { ok: true } : { ok: false, message: j?.message ?? "Could not save" };
}

export default function PosSettingsPage() {
  const [branches, setBranches] = useState<PosBranchDto[] | null>(null);
  const [id, setId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);
  const { devices } = useFiscalDevices();

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch("/api/pos/branches", { cache: "no-store" });
      const j = await r.json();
      if (ignore || !j.success) return;
      setBranches(j.data);
      const wanted = new URLSearchParams(window.location.search).get("branch");
      setId((cur) => cur || (j.data.find((b: PosBranchDto) => b.id === wanted) ? wanted : j.data[0]?.id) || "");
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const branch = useMemo(() => branches?.find((b) => b.id === id), [branches, id]);
  const deviceName = (b: PosBranchDto) => (b.pos.fiscalDeviceId ? (devices.find((d) => d.id === b.pos.fiscalDeviceId)?.name ?? "Device") : "Central device");

  async function toggle(b: PosBranchDto, enabled: boolean) {
    const res = await patchBranch(b.id, { enabled });
    if (!res.ok) toast.error(res.message);
    else toast.success(`Point of sale ${enabled ? "on" : "off"} for ${b.name}`);
    reload();
  }

  async function setAllDevices(value: string) {
    const ids = (branches ?? []).filter((b) => b.pos.enabled).map((b) => b.id);
    if (ids.length === 0) return toast.error("No branch has the point of sale on yet");
    const r = await fetch("/api/pos/branches/assign-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchIds: ids, fiscalDeviceId: value === CENTRAL ? null : value }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) toast.error(j?.message ?? "Could not change the device");
    else toast.success(`${ids.length} branch${ids.length === 1 ? "" : "es"} updated`);
    reload();
  }

  if (!branches) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (branches.length === 0)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No branches yet.{" "}
        <Link href="/branches" className="underline underline-offset-4">
          Add a branch
        </Link>{" "}
        first.
      </div>
    );

  return (
    <div className="w-full space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">POS settings</h1>
        <p className="text-sm text-muted-foreground">Switch the point of sale on for each branch and choose how it sells. Receipt details are set once in Settings and Branches.</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Branch list: pick one, and switch its point of sale on or off right here. */}
        <aside className="overflow-hidden rounded-xl border bg-background">
          <ul className="divide-y" aria-label="Branches">
            {branches.map((b) => (
              <li key={b.id} className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors", b.id === id && "bg-amber-50/70")}>
                <button type="button" onClick={() => setId(b.id)} className="min-w-0 flex-1 text-left" aria-current={b.id === id}>
                  <span className="block truncate text-sm font-medium">{b.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {b.pos.invoicePrefix ? `${b.pos.invoicePrefix} · ` : "No receipt code · "}
                    {b.pos.enabled ? deviceName(b) : "Point of sale off"}
                  </span>
                </button>
                <Switch checked={b.pos.enabled} onCheckedChange={(v) => void toggle(b, v)} aria-label={`Point of sale for ${b.name}`} />
              </li>
            ))}
          </ul>
          {devices.length > 0 && (
            <div className="space-y-1.5 border-t bg-muted/30 p-3">
              <Label className="text-xs text-muted-foreground">Put every branch with the point of sale on…</Label>
              <select
                className={selectClass}
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = "";
                  if (v) void setAllDevices(v);
                }}
                aria-label="Put every branch on one device"
              >
                <option value="">Choose a device…</option>
                <option value={CENTRAL}>Central device</option>
                {devices
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </aside>

        {/* Remounts with fresh state whenever the saved settings change or another branch is picked. */}
        {branch && <BranchPanel key={`${branch.id}:${JSON.stringify(branch.pos)}`} branch={branch} onSaved={reload} onToggle={(v) => void toggle(branch, v)} />}
      </div>
    </div>
  );
}

interface Form {
  taxPercent: string;
  taxCode: string;
  defaultCurrency: "USD" | "ZWG";
  fiscalDeviceId: string;
  noOfflineLimit: boolean;
  offlineLimitHours: string;
}

const toForm = (b: PosBranchDto): Form => ({
  taxPercent: String(b.pos.taxPercent),
  taxCode: b.pos.taxCode,
  defaultCurrency: b.pos.defaultCurrency,
  fiscalDeviceId: b.pos.fiscalDeviceId ?? "",
  noOfflineLimit: b.pos.offlineLimitHours === null,
  offlineLimitHours: String(b.pos.offlineLimitHours ?? 5),
});

function BranchPanel({ branch, onSaved, onToggle }: { branch: PosBranchDto; onSaved: () => void; onToggle: (v: boolean) => void }) {
  const [form, setForm] = useState<Form>(() => toForm(branch));
  const saved = useMemo(() => JSON.stringify(toForm(branch)), [branch]);
  const dirty = JSON.stringify(form) !== saved;
  const { devices } = useFiscalDevices();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const on = branch.pos.enabled;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await patchBranch(branch.id, {
        taxPercent: Number(form.taxPercent),
        taxCode: form.taxCode.trim(),
        defaultCurrency: form.defaultCurrency,
        fiscalDeviceId: form.fiscalDeviceId || null,
        offlineLimitHours: form.noOfflineLimit ? null : Number(form.offlineLimitHours),
      });
      if (!res.ok) setError(res.message);
      else {
        toast.success("Settings saved");
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  /** A sample slip with this branch's finished receipt details, to check paper width, margins and the cutter. */
  async function printTest() {
    const pct = Number(form.taxPercent) || 0;
    const line = (description: string, qty: number, price: number) => {
      const incl = Math.round(qty * price * 100) / 100;
      const vat = Math.round((incl - incl / (1 + pct / 100)) * 100) / 100;
      return { description, quantity: qty, unitPrice: price, taxPercent: pct, vatAmount: vat, lineTotalExcl: Math.round((incl - vat) * 100) / 100, lineTotalIncl: incl };
    };
    const lines = [line("Sample item one", 2, 2.5), line("A much longer sample item description that wraps", 1, 6.55)];
    const total = Math.round(lines.reduce((s, l) => s + l.lineTotalIncl, 0) * 100) / 100;
    const vat = Math.round(lines.reduce((s, l) => s + l.vatAmount, 0) * 100) / 100;
    const sale = {
      status: "FISCALISED",
      currency: form.defaultCurrency,
      paymentMethod: "CASH",
      lines,
      subtotalExclTax: Math.round((total - vat) * 100) / 100,
      totalVat: vat,
      totalAmount: total,
      invoiceNumber: `${(branch.pos.invoicePrefix || "H").toUpperCase()}${form.defaultCurrency === "USD" ? "U" : "Z"}0000`,
      soldAt: new Date().toISOString(),
      fiscal: {
        verificationCode: "TEST-0000-0000-0000",
        verificationLink: "https://example.invalid/verify",
        qrCodeUrl: "https://example.invalid/test-print",
        fiscalDayNo: 0,
        receiptGlobalNo: "0",
        deviceId: "TEST",
        deviceSerialNumber: "TEST",
      },
    };
    await printSlip(sale as never, branch.pos.receipt, { test: true });
  }

  const r = branch.pos.receipt;

  return (
    <section className="rounded-xl border bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{branch.name}</h2>
          <p className="text-sm text-muted-foreground">
            {branch.location}
            {branch.pos.invoicePrefix ? ` · receipt code ${branch.pos.invoicePrefix}` : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className={cn("font-medium", on ? "text-emerald-700" : "text-muted-foreground")}>{on ? "Point of sale is on" : "Point of sale is off"}</span>
          <Switch checked={on} onCheckedChange={onToggle} aria-label="Point of sale for this branch" />
        </label>
        {on && (
          <Button variant="outline" asChild>
            <Link href={`/pos?branchId=${branch.id}`}>Open till</Link>
          </Button>
        )}
      </header>

      {!branch.pos.invoicePrefix && (
        <p className="mx-5 mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This branch has no receipt code yet, so the point of sale cannot be switched on.{" "}
          <Link href="/branches" className="underline underline-offset-4">
            Set one in Branches
          </Link>
          .
        </p>
      )}

      <Tabs defaultValue="selling" className="p-5">
        <TabsList>
          <TabsTrigger value="selling">Selling</TabsTrigger>
          <TabsTrigger value="tills">Tills</TabsTrigger>
          <TabsTrigger value="receipt">Receipt</TabsTrigger>
        </TabsList>

        <TabsContent value="selling" className="space-y-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default currency">
              <select value={form.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value as "USD" | "ZWG")} className={selectClass}>
                <option value="USD">USD</option>
                <option value="ZWG">ZWG</option>
              </select>
            </Field>
            <Field label="Fiscal device" hint="Where this branch's receipts are reported to ZIMRA.">
              <select value={form.fiscalDeviceId} onChange={(e) => set("fiscalDeviceId", e.target.value)} className={selectClass}>
                <option value="">Central device</option>
                {devices
                  .filter((d) => d.active || d.id === form.fiscalDeviceId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.active ? "" : " (off)"}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="VAT %" hint="Must exist on the fiscal device (currently 15.5% standard rated).">
              <Input inputMode="decimal" value={form.taxPercent} onChange={(e) => set("taxPercent", e.target.value)} />
            </Field>
            <Field label="Tax code" hint="A = standard rated.">
              <Input value={form.taxCode} maxLength={4} onChange={(e) => set("taxCode", e.target.value.toUpperCase())} />
            </Field>
          </div>
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>No limit on offline selling</Label>
                <p className="text-xs text-muted-foreground">Keep trading however long the connection is down.</p>
              </div>
              <Switch checked={form.noOfflineLimit} onCheckedChange={(v) => set("noOfflineLimit", v)} aria-label="No offline limit" />
            </div>
            {!form.noOfflineLimit && (
              <Field label="Offline limit (hours)" hint="After this long offline the till asks for a connection.">
                <Input className="max-w-32" inputMode="decimal" value={form.offlineLimitHours} onChange={(e) => set("offlineLimitHours", e.target.value)} />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {dirty && !saving && <span className="text-xs text-muted-foreground">You have unsaved changes.</span>}
            {error && (
              <span className="text-sm text-destructive" role="alert">
                {error}
              </span>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tills" className="pt-4">
          <TillsPanel branchId={branch.id} branchEnabled={on} />
        </TabsContent>

        <TabsContent value="receipt" className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">
            This is what this branch prints. Nothing is typed here: company details come from{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Settings
            </Link>{" "}
            and this branch&apos;s address and contact from{" "}
            <Link href="/branches" className="underline underline-offset-4">
              Branches
            </Link>
            .
          </p>
          <div className="mx-auto w-full max-w-[17rem] rounded-md border bg-white p-4 text-center font-mono text-[11px] leading-snug text-slate-800 shadow-xs">
            {r.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logoUrl} alt="" className="mx-auto mb-2 max-h-12 object-contain" />
            )}
            <div className="text-xs font-bold">{r.companyName || "Company name not set"}</div>
            <div className="text-slate-500">{r.branchName || branch.name}</div>
            <div>{r.address || "No address"}</div>
            <div>
              {r.phone || "No phone"} · {r.email || "no email"}
            </div>
            <div className="mt-1">TIN {r.tin || "—"}</div>
            <div>VAT {r.vatNumber || "—"}</div>
            <div className="my-2 border-t border-dashed" />
            <div className="text-slate-500">items, totals, QR code</div>
            <div className="my-2 border-t border-dashed" />
            {(r.footerLines?.length ? r.footerLines : ["Thank you for your business"]).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={() => void printTest()}>
              Print test slip
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
