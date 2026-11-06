"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TillDto } from "@/lib/services/posTill.service";

/** Admin: how many tills a branch has, and a name and on/off switch for each. */
export function TillsPanel({ branchId }: { branchId: string }) {
  const [tills, setTills] = useState<TillDto[] | null>(null);
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch(`/api/pos/branches/${branchId}/tills?all=1`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (ignore || !r.ok || !j?.success) return;
      setTills(j.data);
      setCount(String((j.data as TillDto[]).filter((t) => t.enabled).length));
    })();
    return () => {
      ignore = true;
    };
  }, [branchId, reloadKey]);

  async function apply() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      toast.error("Enter a whole number from 0 to 50");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/pos/branches/${branchId}/tills`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: n }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) toast.error(j?.message ?? "Could not set tills");
      else {
        setTills(j.data);
        toast.success(`${n} till${n === 1 ? "" : "s"} on`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function patch(t: TillDto, change: { name?: string; enabled?: boolean }) {
    const r = await fetch(`/api/pos/tills/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) {
      toast.error(j?.message ?? "Could not update the till");
      reload();
      return;
    }
    const next = (tills ?? []).map((x) => (x.id === t.id ? (j.data as TillDto) : x));
    setTills(next);
    setCount(String(next.filter((x) => x.enabled).length));
  }

  return (
    <section className="space-y-4 rounded-xl border bg-background p-5">
      <div>
        <h2 className="font-medium">Tills</h2>
        <p className="text-sm text-muted-foreground">
          The cash desks in this branch. They all use this branch&apos;s invoice numbers and fiscal device; the till is recorded on each sale so you can trace and report by it.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="till-count">Number of tills</Label>
          <Input id="till-count" className="w-28" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => void apply()} disabled={busy || tills === null}>
          {busy ? "Applying…" : "Apply"}
        </Button>
        <p className="pb-2 text-xs text-muted-foreground">Tills beyond this number are switched off, not deleted.</p>
      </div>
      {tills && tills.length > 0 && (
        <ul className="divide-y rounded-md border">
          {tills.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{t.code}</span>
              <Input
                key={t.name}
                className="h-8 max-w-64"
                defaultValue={t.name}
                aria-label={`Name of till ${t.code}`}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.name) void patch(t, { name: v });
                }}
              />
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {t.enabled ? "On" : "Off"}
                <Switch checked={t.enabled} onCheckedChange={(v) => void patch(t, { enabled: v })} aria-label={`Till ${t.code} on or off`} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {tills && tills.length === 0 && <p className="text-sm text-muted-foreground">No tills yet. Tills are optional: without them, sales are not tied to a till.</p>}
    </section>
  );
}
