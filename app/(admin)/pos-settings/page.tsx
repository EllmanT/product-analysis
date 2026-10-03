"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { printSlip } from "@/lib/pos/print";
import type { PosBranchDto } from "@/lib/services/posBranch.service";

interface Form {
  enabled: boolean;
  invoicePrefix: string;
  taxPercent: string;
  taxCode: string;
  defaultCurrency: "USD" | "ZWG";
  noOfflineLimit: boolean;
  offlineLimitHours: string;
  companyName: string;
  branchName: string;
  address: string;
  phone: string;
  email: string;
  tin: string;
  vatNumber: string;
  logoUrl: string;
  footer: string;
}

const toForm = (b: PosBranchDto): Form => ({
  enabled: b.pos.enabled,
  invoicePrefix: b.pos.invoicePrefix ?? "",
  taxPercent: String(b.pos.taxPercent),
  taxCode: b.pos.taxCode,
  defaultCurrency: b.pos.defaultCurrency,
  noOfflineLimit: b.pos.offlineLimitHours === null,
  offlineLimitHours: String(b.pos.offlineLimitHours ?? 5),
  companyName: b.pos.receipt.companyName ?? "",
  branchName: b.pos.receipt.branchName ?? "",
  address: b.pos.receipt.address ?? "",
  phone: b.pos.receipt.phone ?? "",
  email: b.pos.receipt.email ?? "",
  tin: b.pos.receipt.tin ?? "",
  vatNumber: b.pos.receipt.vatNumber ?? "",
  logoUrl: b.pos.receipt.logoUrl ?? "",
  footer: (b.pos.receipt.footerLines ?? []).join("\n"),
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function PosSettingsPage() {
  const [branches, setBranches] = useState<PosBranchDto[] | null>(null);
  const [id, setId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch("/api/pos/branches", { cache: "no-store" });
      const j = await r.json();
      if (ignore || !j.success) return;
      setBranches(j.data);
      setId((cur) => cur || j.data[0]?.id || "");
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const branch = useMemo(() => branches?.find((b) => b.id === id), [branches, id]);

  if (!branches) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (branches.length === 0) return <div className="p-6 text-sm text-muted-foreground">No branches yet. Add a branch first.</div>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">POS settings</h1>
          <p className="text-sm text-muted-foreground">Each branch has its own invoice prefix, VAT and the details printed on its slips.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="branch">Branch</Label>
          <select
            id="branch"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.pos.enabled ? "" : " (POS off)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Remounts with fresh state whenever the saved settings change or another branch is picked. */}
      {branch && <SettingsForm key={`${branch.id}:${JSON.stringify(branch.pos)}`} branch={branch} onSaved={reload} />}
    </div>
  );
}

function SettingsForm({ branch, onSaved }: { branch: PosBranchDto; onSaved: () => void }) {
  const id = branch.id;
  const [form, setForm] = useState<Form>(() => toForm(branch));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** A sample slip with this branch's details, to check paper width, margins and the cutter on the real printer. */
  async function printTest() {
    const pct = Number(form.taxPercent) || 0;
    const vat = Math.round((11.55 - 11.55 / (1 + pct / 100)) * 100) / 100;
    const sale = {
      status: "FISCALISED",
      currency: form.defaultCurrency,
      paymentMethod: "CASH",
      lines: [
        { description: "Sample item one", quantity: 2, unitPrice: 2.5, taxPercent: pct, vatAmount: Math.round((5 - 5 / (1 + pct / 100)) * 100) / 100, lineTotalExcl: 0, lineTotalIncl: 5 },
        { description: "A much longer sample item description that wraps", quantity: 1, unitPrice: 6.55, taxPercent: pct, vatAmount: Math.round((6.55 - 6.55 / (1 + pct / 100)) * 100) / 100, lineTotalExcl: 0, lineTotalIncl: 6.55 },
      ],
      subtotalExclTax: Math.round((11.55 - vat) * 100) / 100,
      totalVat: vat,
      totalAmount: 11.55,
      invoiceNumber: `${(form.invoicePrefix || "H").toUpperCase()}${form.defaultCurrency === "USD" ? "U" : "Z"}0000`,
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
    sale.lines.forEach((l) => (l.lineTotalExcl = Math.round((l.lineTotalIncl - l.vatAmount) * 100) / 100));
    await printSlip(sale as never, {
      companyName: form.companyName,
      branchName: form.branchName,
      address: form.address,
      phone: form.phone,
      email: form.email,
      tin: form.tin,
      vatNumber: form.vatNumber,
      logoUrl: form.logoUrl,
      footerLines: form.footer.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean),
    }, { test: true });
  }

  async function save() {
    setSaving(true);
    setError("");
    const hours = Number(form.offlineLimitHours);
    const body = {
      enabled: form.enabled,
      ...(form.invoicePrefix.trim() ? { invoicePrefix: form.invoicePrefix.trim() } : {}),
      taxPercent: Number(form.taxPercent),
      taxCode: form.taxCode.trim(),
      defaultCurrency: form.defaultCurrency,
      offlineLimitHours: form.noOfflineLimit ? null : hours,
      receipt: {
        companyName: form.companyName,
        branchName: form.branchName,
        address: form.address,
        phone: form.phone,
        email: form.email,
        tin: form.tin,
        vatNumber: form.vatNumber,
        logoUrl: form.logoUrl,
        footerLines: form.footer.split("\n").map((l) => l.trim()).filter(Boolean),
      },
    };
    try {
      const r = await fetch(`/api/pos/branches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) setError(j?.message ?? "Could not save");
      else {
        toast.success("POS settings saved");
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
          <section className="space-y-4 rounded-xl border bg-background p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Point of sale</h2>
                <p className="text-sm text-muted-foreground">Cashiers and branch users of this branch can open the till when it is on.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Enable point of sale" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Invoice prefix"
                hint={`Numbers look like ${(form.invoicePrefix || "H").toUpperCase()}U0001 (USD) and ${(form.invoicePrefix || "H").toUpperCase()}Z0001 (ZWG). Unique per branch.`}
              >
                <Input value={form.invoicePrefix} maxLength={4} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())} />
              </Field>
              <Field label="Default currency">
                <select
                  value={form.defaultCurrency}
                  onChange={(e) => set("defaultCurrency", e.target.value as "USD" | "ZWG")}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
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
              <div className="flex items-center justify-between">
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
          </section>

          <section className="space-y-4 rounded-xl border bg-background p-5">
            <div>
              <h2 className="font-medium">Receipt details</h2>
              <p className="text-sm text-muted-foreground">Printed at the top of every slip from this branch.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
              </Field>
              <Field label="Branch name">
                <Input value={form.branchName} onChange={(e) => set("branchName", e.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Logo URL" hint="Optional. A small PNG on a white background prints best.">
                <Input value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
              </Field>
              <Field label="TIN">
                <Input value={form.tin} onChange={(e) => set("tin", e.target.value)} />
              </Field>
              <Field label="VAT number">
                <Input value={form.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} />
              </Field>
            </div>
            <Field label="Footer lines" hint="One per line, up to 6. Defaults to “Thank you for your business”.">
              <textarea
                rows={3}
                value={form.footer}
                onChange={(e) => set("footer", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
              />
            </Field>
          </section>

          <div className="flex items-center gap-3">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void printTest()}>
              Print test slip
            </Button>
            {form.enabled && branch?.pos.enabled && (
              <Button variant="outline" asChild>
                <Link href={`/pos?branchId=${id}`}>Open this till</Link>
              </Button>
            )}
            {error && (
              <span className="text-sm text-destructive" role="alert">
                {error}
              </span>
            )}
          </div>
    </>
  );
}
