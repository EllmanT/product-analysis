"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CENTRAL, useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import { Button } from "@/components/ui/button";
import type { PosBranchDto } from "@/lib/services/posBranch.service";

const selectClass =
  "h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

/**
 * Which fiscal device each branch sells through, in one place. Every branch on one device, or each on
 * its own, or a mix: it is only this setting, nothing else changes.
 */
export function DeviceTopologyPanel({ branches, onChanged }: { branches: PosBranchDto[]; onChanged: () => void }) {
  const { devices, loaded } = useFiscalDevices();
  const [busy, setBusy] = useState(false);
  if (!loaded || devices.length === 0) return null;

  const nameOf = (id: string | null | undefined) => (id ? (devices.find((d) => d.id === id)?.name ?? "Unknown device") : "Central device");

  async function assign(branchIds: string[], deviceId: string | null) {
    setBusy(true);
    try {
      const r = await fetch("/api/pos/branches/assign-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchIds, fiscalDeviceId: deviceId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) toast.error(j?.message ?? "Could not change the device");
      else {
        toast.success(`${branchIds.length} branch${branchIds.length === 1 ? "" : "es"} updated`);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  const posBranches = branches.filter((b) => b.pos.enabled);
  const counts = new Map<string, number>();
  for (const b of posBranches) counts.set(b.pos.fiscalDeviceId ?? CENTRAL, (counts.get(b.pos.fiscalDeviceId ?? CENTRAL) ?? 0) + 1);

  return (
    <section className="space-y-4 rounded-xl border bg-background p-5">
      <div>
        <h2 className="font-medium">Fiscal devices by branch</h2>
        <p className="text-sm text-muted-foreground">
          Choose which device each branch sells through. New sales use the choice at once; sales already waiting stay with the device they were made on.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {[...counts.entries()].map(([k, n]) => (
          <span key={k} className="rounded-full border px-2.5 py-1">
            {k === CENTRAL ? "Central device" : nameOf(k)}: {n} branch{n === 1 ? "" : "es"}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Put every POS branch on:</span>
        <select
          className={selectClass}
          disabled={busy || posBranches.length === 0}
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            e.target.value = "";
            if (v) void assign(posBranches.map((b) => b.id), v === CENTRAL ? null : v);
          }}
          aria-label="Put every POS branch on one device"
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
      <ul className="divide-y rounded-md border">
        {posBranches.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="min-w-40 text-sm">{b.name}</span>
            <select
              className={selectClass}
              disabled={busy}
              value={b.pos.fiscalDeviceId ?? CENTRAL}
              onChange={(e) => void assign([b.id], e.target.value === CENTRAL ? null : e.target.value)}
              aria-label={`Fiscal device for ${b.name}`}
            >
              <option value={CENTRAL}>Central device</option>
              {devices
                .filter((d) => d.active || d.id === b.pos.fiscalDeviceId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.active ? "" : " (off)"}
                  </option>
                ))}
            </select>
          </li>
        ))}
        {posBranches.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No branch has the point of sale switched on yet.</li>}
      </ul>
      <Button type="button" variant="ghost" size="sm" onClick={onChanged} disabled={busy}>
        Refresh
      </Button>
    </section>
  );
}
