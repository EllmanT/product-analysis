"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { TillDto } from "@/lib/services/posTill.service";

/** Admin: a branch's tills. Each till has one control (on/off) and one plain status. */
export function TillsPanel({ branchId, branchEnabled = true }: { branchId: string; branchEnabled?: boolean }) {
  const [tills, setTills] = useState<TillDto[] | null>(null);
  const [adding, setAdding] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch(`/api/pos/branches/${branchId}/tills?all=1`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (ignore || !r.ok || !j?.success) return;
      setTills(j.data);
    })();
    return () => {
      ignore = true;
    };
  }, [branchId, reloadKey]);

  async function add() {
    setAdding(true);
    try {
      const r = await fetch(`/api/pos/branches/${branchId}/tills`, { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) toast.error(j?.message ?? "Could not add a till");
      else {
        setTills(j.data);
        toast.success("Till added");
      }
    } finally {
      setAdding(false);
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
    setTills((tills ?? []).map((x) => (x.id === t.id ? (j.data as TillDto) : x)));
  }

  const status = (t: TillDto) =>
    !t.enabled
      ? { label: "Off", tone: "text-muted-foreground bg-muted" }
      : !branchEnabled
        ? { label: "Waiting for point of sale to be switched on", tone: "text-amber-800 bg-amber-100" }
        : { label: "Ready", tone: "text-emerald-800 bg-emerald-100" };

  return (
    <section className="space-y-4 rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Tills</h2>
          <p className="text-sm text-muted-foreground">
            A till is one checkout point. All tills in a branch share its receipt numbers and fiscal device, and every sale is recorded against the till that made it.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void add()} disabled={adding || tills === null}>
          {adding ? "Adding…" : "Add a till"}
        </Button>
      </div>
      {!branchEnabled && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Point of sale is off for this branch, so no till can sell yet. Switch it on above and save.</p>
      )}
      {tills && tills.length > 0 && (
        <ul className="divide-y rounded-md border">
          {tills.map((t) => {
            const st = status(t);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
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
                <div className="ml-auto flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${st.tone}`}>{st.label}</span>
                  <Switch checked={t.enabled} onCheckedChange={(v) => void patch(t, { enabled: v })} aria-label={`Till ${t.code} on or off`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {tills && tills.length === 0 && <p className="text-sm text-muted-foreground">No tills yet. Add one so each sale can be traced to the desk that made it.</p>}
    </section>
  );
}
