"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Customer {
  _id: string;
  name: string;
  tradeName?: string;
  tin?: string;
  vatNumber?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

const EMPTY = { name: "", tradeName: "", tin: "", vatNumber: "", address: "", city: "", phone: "", email: "" };
type Form = typeof EMPTY;

const FIELDS: { key: keyof Form; label: string; type?: string; wide?: boolean }[] = [
  { key: "name", label: "Registered name", wide: true },
  { key: "tradeName", label: "Trading name", wide: true },
  { key: "tin", label: "TIN" },
  { key: "vatNumber", label: "VAT number" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", wide: true },
  { key: "city", label: "City" },
];

export default function PosCustomersPage() {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await fetch("/api/pos/customers?manage=1", { cache: "no-store" }).then((r) => r.json());
      if (!j.success) return setError(j.message ?? "Could not load customers");
      setError("");
      setRows(j.data);
    } catch {
      setError("Could not reach the server");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (c) => (showArchived || c.isActive) && (!t || [c.name, c.tradeName, c.tin, c.email, c.phone].some((v) => v?.toLowerCase().includes(t)))
    );
  }, [rows, q, showArchived]);

  function open(c: Customer | "new") {
    setEditing(c);
    setFormError("");
    if (c === "new") return setForm(EMPTY);
    setForm({
      name: c.name,
      tradeName: c.tradeName ?? "",
      tin: c.tin ?? "",
      vatNumber: c.vatNumber ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const isNew = editing === "new";
      const r = await fetch(isNew ? "/api/pos/customers" : `/api/pos/customers/${(editing as Customer)._id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) return setFormError(j?.message ?? "Could not save");
      toast.success(isNew ? "Customer added" : "Customer updated");
      setEditing(null);
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function setActive(c: Customer, isActive: boolean) {
    const r = await fetch(`/api/pos/customers/${c._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!r.ok) return toast.error("Could not update the customer");
    toast.success(isActive ? "Customer restored" : "Customer archived");
    void load();
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">POS customers</h1>
          <p className="text-sm text-muted-foreground">
            Cashiers type a name at the till and the TIN, email and address fill in. Shared by all branches. Past invoices keep the details they were issued with.
          </p>
        </div>
        <Button onClick={() => open("new")}>Add customer</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, TIN, email, phone" aria-label="Search customers" className="max-w-sm" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {["Name", "TIN", "VAT no", "Email", "Phone", "Address", ""].map((h, i) => (
                <th key={i} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c._id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">
                  {c.name}
                  {c.tradeName && c.tradeName !== c.name && <div className="text-xs font-normal text-muted-foreground">{c.tradeName}</div>}
                  {!c.isActive && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">archived</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">{c.tin || "–"}</td>
                <td className="px-3 py-2 tabular-nums">{c.vatNumber || "–"}</td>
                <td className="px-3 py-2">{c.email || "–"}</td>
                <td className="px-3 py-2">{c.phone || "–"}</td>
                <td className="max-w-56 truncate px-3 py-2">{[c.address, c.city].filter(Boolean).join(", ") || "–"}</td>
                <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => open(c)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void setActive(c, !c.isActive)}>
                    {c.isActive ? "Archive" : "Restore"}
                  </Button>
                </td>
              </tr>
            ))}
            {rows && shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  {rows.length === 0 ? "No customers yet. Add the first one." : "No customers match."}
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Add customer" : "Edit customer"}</DialogTitle>
              <DialogDescription>Only the name is required. Fill in the rest so the till can complete invoices automatically.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.wide ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                  <Label htmlFor={`c-${f.key}`}>{f.label}</Label>
                  <Input id={`c-${f.key}`} type={f.type} value={form[f.key]} autoFocus={f.key === "name"} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
