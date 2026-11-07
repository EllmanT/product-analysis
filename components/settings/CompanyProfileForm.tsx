"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompanyProfileDto } from "@/lib/services/companyProfile.service";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const EMPTY: CompanyProfileDto = { companyName: "", tradeName: "", tin: "", vatNumber: "", address: "", phone: "", email: "", logoUrl: "", footerLines: [] };

/** A small stand-in for the top and bottom of a slip, so the effect of each field is visible before saving. */
function SlipPreview({ p }: { p: CompanyProfileDto }) {
  const footer = p.footerLines.length ? p.footerLines : ["Thank you for your business"];
  return (
    <div className="mx-auto w-full max-w-[17rem] rounded-md border bg-white p-4 text-center font-mono text-[11px] leading-snug text-slate-800 shadow-xs" aria-label="Receipt preview">
      {p.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.logoUrl} alt="" className="mx-auto mb-2 max-h-12 object-contain" />
      )}
      <div className="text-xs font-bold">{p.companyName || "Company name"}</div>
      {p.tradeName && <div>t/a {p.tradeName}</div>}
      <div className="text-slate-500">Branch name</div>
      <div>{p.address || "Head office address"}</div>
      <div>
        {p.phone || "Phone"} · {p.email || "email"}
      </div>
      <div className="mt-1">TIN {p.tin || "—"}</div>
      <div>VAT {p.vatNumber || "—"}</div>
      <div className="my-2 border-t border-dashed" />
      <div className="text-slate-500">items, totals, QR code</div>
      <div className="my-2 border-t border-dashed" />
      {footer.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export default function CompanyProfileForm() {
  const [form, setForm] = useState<CompanyProfileDto | null>(null);
  const [footer, setFooter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/company-profile", { cache: "no-store" });
        const j = await r.json();
        if (ignore) return;
        if (!j?.success) return setError(j?.message ?? "Could not load the company details.");
        setForm(j.data);
        setFooter((j.data.footerLines ?? []).join("\n"));
      } catch {
        if (!ignore) setError("Network error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  if (!form) return <p className="py-8 text-sm text-muted-foreground">{error || "Loading…"}</p>;

  const set = <K extends keyof CompanyProfileDto>(k: K, v: CompanyProfileDto[K]) => setForm((f) => ({ ...(f ?? EMPTY), [k]: v }));
  const footerLines = footer.split("\n").map((l) => l.trim()).filter(Boolean);
  const preview = { ...form, footerLines };

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/admin/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, footerLines }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) setError(j?.message ?? "Could not save");
      else {
        setForm(j.data);
        toast.success("Company details saved");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-background p-5">
          <div>
            <h2 className="font-medium">Company details</h2>
            <p className="text-sm text-muted-foreground">Typed once here and printed on every receipt, invoice and invoice email, for every branch.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Registered company name">
              <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field label="Trade name" hint="Optional. Printed as “t/a …” under the company name.">
              <Input value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
            </Field>
            <Field label="TIN">
              <Input value={form.tin} onChange={(e) => set("tin", e.target.value)} />
            </Field>
            <Field label="VAT number">
              <Input value={form.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-background p-5">
          <div>
            <h2 className="font-medium">Head office</h2>
            <p className="text-sm text-muted-foreground">Used by any branch that has no address, phone or email of its own. Branches add theirs under Branches.</p>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-background p-5">
          <div>
            <h2 className="font-medium">Look of the receipt</h2>
            <p className="text-sm text-muted-foreground">The same for every branch.</p>
          </div>
          <Field label="Logo URL" hint="Optional. A small PNG on a white background prints best.">
            <Input value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
          </Field>
          <Field label="Footer lines" hint="One per line, up to 6. Defaults to “Thank you for your business”.">
            <textarea
              rows={3}
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
          </Field>
        </section>

        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save company details"}
          </Button>
          {error && (
            <span className="text-sm text-destructive" role="alert">
              {error}
            </span>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Receipt preview</p>
        <SlipPreview p={preview} />
      </aside>
    </div>
  );
}
