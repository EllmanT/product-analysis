"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CompanyProfileDto } from "@/lib/services/companyProfile.service";
import type { PosBranchDto } from "@/lib/services/posBranch.service";
import { cn } from "@/lib/utils";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Edit what is different about one branch: its name, receipt code and the address and contact on its slips. */
function EditBranchSheet({
  branch,
  company,
  onClose,
  onSaved,
}: {
  branch: PosBranchDto | null;
  company: CompanyProfileDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: "", location: "", prefix: "", address: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!branch) return;
    setForm({
      name: branch.name,
      location: branch.location,
      prefix: branch.pos.invoicePrefix ?? "",
      address: branch.contact.address,
      phone: branch.contact.phone,
      email: branch.contact.email,
    });
    setError("");
  }, [branch]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!branch) return;
    setSaving(true);
    setError("");
    try {
      const prefix = form.prefix.trim();
      const r = await fetch(`/api/pos/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim(),
          ...(prefix ? { invoicePrefix: prefix } : {}),
          receipt: { branchName: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), email: form.email.trim() },
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) return setError(j?.message ?? "Could not save");
      toast.success(`${form.name.trim()} saved`);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!branch} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Edit {branch?.name}</SheetTitle>
          <SheetDescription>What makes this branch different on its receipts.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch name">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Town or suburb">
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
          </div>
          <Field
            label="Receipt code"
            hint={`Receipts are numbered like ${(form.prefix || "H").toUpperCase()}U0001. It tells you which branch issued a receipt, so each branch needs its own.`}
          >
            <Input className="max-w-32" maxLength={4} value={form.prefix} onChange={(e) => set("prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          </Field>
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">Printed on this branch&apos;s receipts</p>
            <Field label="Address" hint={company?.address ? `Blank prints head office: ${company.address}` : "Blank prints head office's address (Settings > Company)."}>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" hint={company?.phone ? `Blank prints ${company.phone}` : undefined}>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email" hint={company?.email ? `Blank prints ${company.email}` : undefined}>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Company name, TIN, VAT number, logo and footer are the same for every branch.{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Edit them in Settings
              </Link>
              .
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save branch"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function BranchesTable({ reloadKey }: { reloadKey: number }) {
  const [branches, setBranches] = useState<PosBranchDto[] | null>(null);
  const [company, setCompany] = useState<CompanyProfileDto | null>(null);
  const [editing, setEditing] = useState<PosBranchDto | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const [b, c] = await Promise.all([
        fetch("/api/pos/branches", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/company-profile", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (ignore) return;
      setBranches(b?.success ? b.data : []);
      setCompany(c?.success ? c.data : null);
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey, key]);

  if (!branches) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="w-full rounded-xl border bg-background">
        <table className="w-full table-auto text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Receipt code</th>
              <th className="px-4 py-3">Address on receipts</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Point of sale</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => {
              const own = b.contact;
              const cell = (own: string, fallback: string) =>
                own ? <span>{own}</span> : fallback ? <span className="text-muted-foreground" title="Head office's, because this branch has none of its own">{fallback}</span> : <span className="text-muted-foreground">—</span>;
              return (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.location}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{b.pos.invoicePrefix ?? "—"}</td>
                  <td className="max-w-72 px-4 py-3">{cell(own.address, company?.address ?? "")}</td>
                  <td className="px-4 py-3">{cell(own.phone, company?.phone ?? "")}</td>
                  <td className="px-4 py-3">{cell(own.email, company?.email ?? "")}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", b.pos.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                      {b.pos.enabled ? "On" : "Off"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(b)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
            {branches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No branches yet. Use Add branch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Grey text is head office&apos;s detail, printed because the branch has none of its own.</p>
      <EditBranchSheet branch={editing} company={company} onClose={() => setEditing(null)} onSaved={() => setKey((k) => k + 1)} />
    </>
  );
}
