"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useFiscalDevices } from "@/components/fiscal/DeviceSelect";
import { Button } from "@/components/ui/button";
import { setSelectedTillId } from "@/lib/pos/tillSelection";
import type { PosBranchDto } from "@/lib/services/posBranch.service";
import type { TillDto } from "@/lib/services/posTill.service";
import { cn } from "@/lib/utils";

interface Row {
  branch: PosBranchDto;
  tills: TillDto[];
}

/** Every till you may use, grouped by branch, with one button to go and sell. */
export default function TillsPage() {
  const router = useRouter();
  const { devices } = useFiscalDevices();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const b = await fetch("/api/pos/branches", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const branches: PosBranchDto[] = b?.success ? b.data : [];
      const withTills = await Promise.all(
        branches.map(async (branch) => {
          const t = await fetch(`/api/pos/branches/${branch.id}/tills`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
          return { branch, tills: (t?.success ? t.data : []) as TillDto[] };
        })
      );
      if (!ignore) setRows(withTills);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  function open(branchId: string, tillId: string | null) {
    setSelectedTillId(branchId, tillId);
    router.push(`/pos?branchId=${branchId}`);
  }

  if (!rows) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Tills</h1>
          <p className="text-sm text-muted-foreground">Pick a till to start selling. Use Back to admin in the till to return here.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/pos-settings">Manage tills in POS settings</Link>
        </Button>
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">No branches yet.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ branch, tills }) => {
          const on = branch.pos.enabled && !!branch.pos.invoicePrefix;
          const device = branch.pos.fiscalDeviceId ? (devices.find((d) => d.id === branch.pos.fiscalDeviceId)?.name ?? "Device") : "Central device";
          return (
            <section key={branch.id} className="rounded-xl border bg-background">
              <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{branch.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {branch.pos.invoicePrefix ? `${branch.pos.invoicePrefix} · ` : ""}
                    {on ? device : "Point of sale off"}
                  </p>
                </div>
                {!on && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/pos-settings?branch=${branch.id}`}>Set up</Link>
                  </Button>
                )}
              </header>
              {on ? (
                tills.length > 0 ? (
                  <ul className="divide-y">
                    {tills.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{t.code}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                        <Button size="sm" onClick={() => open(branch.id, t.id)}>
                          Go to Till
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
                    <span>No tills added yet.</span>
                    <Button size="sm" variant="outline" onClick={() => open(branch.id, null)}>
                      Go to Till
                    </Button>
                  </div>
                )
              ) : (
                <p className={cn("px-4 py-3 text-sm text-muted-foreground")}>Switch the point of sale on to sell here.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
