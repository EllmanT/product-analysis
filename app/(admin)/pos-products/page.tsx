"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PosBranchDto } from "@/lib/services/posBranch.service";

interface Product {
  _id: string;
  name: string;
  code?: string;
  priceUsd: number;
  priceZwg?: number;
  priceOnEntry: boolean;
  isActive: boolean;
  branchId?: string;
}

/** Accepts tab or comma separated lines: name, code, USD price (code optional). Handy when pasting from Excel. */
function parseImport(text: string) {
  const items: { name: string; code?: string; priceUsd: number }[] = [];
  const bad: number[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      const priceStr = parts[parts.length - 1]?.replace(/[^0-9.]/g, "");
      const price = Number(priceStr);
      const name = parts[0];
      const code = parts.length >= 3 ? parts[1] : undefined;
      if (!name || !(price >= 0) || priceStr === "") bad.push(i + 1);
      else items.push({ name, ...(code ? { code } : {}), priceUsd: price });
    });
  return { items, bad };
}

export default function PosProductsPage() {
  const [branches, setBranches] = useState<PosBranchDto[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState({ name: "", code: "", priceUsd: "", priceZwg: "", priceOnEntry: false });
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [overwritePrices, setOverwritePrices] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch("/api/pos/branches", { cache: "no-store" });
      const j = await r.json();
      if (ignore || !j.success) return;
      setBranches(j.data);
      const admin = Boolean(j.meta?.isAdmin);
      setIsAdmin(admin);
      setBranchId(admin ? "" : (j.data[0]?.id ?? ""));
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const q = branchId ? `&branchId=${branchId}` : "";
      const r = await fetch(`/api/pos/products?manage=1${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!ignore && j.success) setProducts(j.data);
    })();
    return () => {
      ignore = true;
    };
  }, [branchId, reloadKey]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (products ?? []).filter((p) => !f || p.name.toLowerCase().includes(f) || (p.code ?? "").toLowerCase().includes(f)).slice(0, 300);
  }, [products, filter]);

  async function post(items: unknown[]) {
    const r = await fetch("/api/pos/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(branchId ? { branchId } : {}), items }),
    });
    return { ok: r.ok, json: await r.json().catch(() => null) };
  }

  async function add() {
    const price = Number(draft.priceUsd);
    if (!draft.name.trim() || !(price >= 0) || draft.priceUsd === "") return toast.error("Enter a name and a USD price");
    setBusy(true);
    const { ok, json } = await post([
      {
        name: draft.name.trim(),
        ...(draft.code.trim() ? { code: draft.code.trim() } : {}),
        priceUsd: price,
        ...(draft.priceZwg.trim() ? { priceZwg: Number(draft.priceZwg) } : {}),
        priceOnEntry: draft.priceOnEntry,
      },
    ]);
    setBusy(false);
    if (!ok) return toast.error(json?.message ?? "Could not save");
    setDraft({ name: "", code: "", priceUsd: "", priceZwg: "", priceOnEntry: false });
    reload();
  }

  async function runImport() {
    const { items, bad } = parseImport(importText);
    if (bad.length) return toast.error(`Fix line${bad.length > 1 ? "s" : ""} ${bad.slice(0, 5).join(", ")}: need a name and a price`);
    if (!items.length) return toast.error("Nothing to import");
    setBusy(true);
    const { ok, json } = await post(items);
    setBusy(false);
    if (!ok) return toast.error(json?.message ?? "Import failed");
    toast.success(`${json.data.created} added, ${json.data.updated} updated`);
    setImportText("");
    reload();
  }

  async function importStock() {
    setBusy(true);
    try {
      const r = await fetch("/api/pos/products/import-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, overwritePrices }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) return toast.error(j?.message ?? "Import failed");
      const d = j.data as { created: number; updated: number; skippedExisting: number; uploadDate: string };
      toast.success(`Stock upload of ${String(d.uploadDate).slice(0, 10)}: ${d.created} added, ${d.updated} updated, ${d.skippedExisting} already listed`);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/pos/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) toast.error((await r.json().catch(() => null))?.message ?? "Could not save");
    reload();
  }

  const preview = useMemo(() => parseImport(importText), [importText]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">POS products</h1>
          <p className="text-sm text-muted-foreground">
            Prices are in USD. The ZWG price is the USD price at today&apos;s exchange rate unless you set a fixed ZWG price.
          </p>
        </div>
        {isAdmin && (
          <div className="space-y-1.5">
            <Label htmlFor="branch">Branch</Label>
            <select
              id="branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <option value="">All branches (shared products)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-medium">Add a product</h2>
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_8rem_8rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input placeholder="Name" aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input placeholder="Code" aria-label="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          <Input placeholder="USD price" aria-label="USD price" inputMode="decimal" value={draft.priceUsd} onChange={(e) => setDraft({ ...draft, priceUsd: e.target.value })} />
          <Input placeholder="ZWG (optional)" aria-label="Fixed ZWG price" inputMode="decimal" value={draft.priceZwg} onChange={(e) => setDraft({ ...draft, priceZwg: e.target.value })} />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-5">
            <input type="checkbox" checked={draft.priceOnEntry} onChange={(e) => setDraft({ ...draft, priceOnEntry: e.target.checked })} />
            Cashier types the price at the till (e.g. “various”, “wiring”)
          </label>
        </form>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="text-sm font-medium">Fill from this branch&apos;s stock upload</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Adds every product that is in stock in the latest stock upload, with its code and price. Upload prices are taken as USD, so check them in the list below.
        </p>
        {branchId ? (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button variant="outline" onClick={() => void importStock()} disabled={busy}>
              Import from latest stock upload
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={overwritePrices} onChange={(e) => setOverwritePrices(e.target.checked)} />
              Also replace the price of products already listed
            </label>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Choose a branch above to import its stock.</p>
        )}
      </section>

      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium">Import many products</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste one product per line from Excel or a text file: <code>name, code, USD price</code> (the code is optional). Existing names are updated.
        </p>
        <textarea
          rows={6}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          aria-label="Products to import"
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={() => void runImport()} disabled={busy || !importText.trim()}>
            Import {preview.items.length ? `${preview.items.length} products` : ""}
          </Button>
          {preview.bad.length > 0 && <span className="text-sm text-destructive">Lines {preview.bad.slice(0, 5).join(", ")} need a name and a price</span>}
        </div>
      </details>

      <section className="rounded-xl border bg-background">
        <div className="flex items-center justify-between gap-3 border-b p-3">
          <Input className="max-w-xs" placeholder="Search products" aria-label="Search products" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <span className="text-xs text-muted-foreground">
            {products ? `${products.filter((p) => p.isActive).length} active` : "Loading…"}
            {shown.length === 300 ? " · showing first 300" : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="w-32 px-3 py-2 text-right font-medium">USD</th>
                <th className="w-32 px-3 py-2 text-right font-medium">Fixed ZWG</th>
                <th className="px-3 py-2 text-center font-medium">Price at till</th>
                <th className="px-3 py-2 text-center font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p._id} className={p.isActive ? "border-b last:border-0" : "border-b opacity-50 last:border-0"}>
                  <td className="px-3 py-2 font-medium">
                    {p.name}
                    {!p.branchId && branchId && <span className="ml-2 text-xs text-muted-foreground">shared</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.code}</td>
                  <td className="px-3 py-2 text-right">
                    <PriceCell key={`${p._id}-usd-${p.priceUsd}`} value={p.priceUsd} label={`USD price for ${p.name}`} onSave={(v) => v !== null && patch(p._id, { priceUsd: v })} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <PriceCell key={`${p._id}-zwg-${p.priceZwg ?? "x"}`} value={p.priceZwg ?? null} blank label={`Fixed ZWG price for ${p.name}`} onSave={(v) => patch(p._id, { priceZwg: v })} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" aria-label={`Price at till for ${p.name}`} checked={p.priceOnEntry} onChange={(e) => void patch(p._id, { priceOnEntry: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" aria-label={`${p.name} active`} checked={p.isActive} onChange={(e) => void patch(p._id, { isActive: e.target.checked })} />
                  </td>
                </tr>
              ))}
              {products && shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    {products.length === 0 ? "No products yet. Add one above or import a list." : "No products match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Edit in place; saves when the field loses focus or Enter is pressed. */
function PriceCell({
  value,
  blank,
  label,
  onSave,
}: {
  value: number | null;
  blank?: boolean;
  label: string;
  onSave: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : value.toFixed(2));
  const commit = () => {
    const t = text.trim();
    if (t === "") return blank ? (value !== null ? onSave(null) : undefined) : setText(value === null ? "" : value.toFixed(2));
    const n = Number(t);
    if (!(n >= 0)) return setText(value === null ? "" : value.toFixed(2));
    if (n !== value) onSave(n);
  };
  return (
    <input
      value={text}
      inputMode="decimal"
      aria-label={label}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
      className="h-8 w-24 rounded-md border border-transparent bg-transparent px-2 text-right tabular-nums outline-none hover:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
    />
  );
}
