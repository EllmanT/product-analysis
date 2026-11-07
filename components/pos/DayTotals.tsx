"use client";

import { money } from "@/lib/pos/slip";
import { cn } from "@/lib/utils";

type Cur = "USD" | "ZWG";

/** What the totals need per currency. Both the till summary and the sales report fit this. */
export interface TotalsRow {
  currency?: Cur;
  fiscalised: { count: number; total: number };
  credit?: { count: number; total: number };
  /** Sales waiting for a fiscal receipt, any day (till) or inside the range (report). */
  waiting?: { count: number; total: number };
  pending?: { count: number; total: number };
  failed?: number;
  voided?: number;
}

/** A sale saved on this till and not sent to the server yet. */
export interface QueuedTotal {
  currency: Cur;
  total: number;
}

const CURRENCIES: Cur[] = ["USD", "ZWG"];

function waitingFor(row: TotalsRow | undefined, queued: QueuedTotal[], c: Cur) {
  const w = row?.waiting ?? row?.pending ?? { count: 0, total: 0 };
  const q = queued.filter((x) => x.currency === c);
  return { count: w.count + q.length, total: Math.round((w.total + q.reduce((s, x) => s + x.total, 0)) * 100) / 100 };
}

/**
 * The till's "Today" panel. The big numbers are fiscalised invoices only. Anything still waiting for ZIMRA, or saved
 * on this till and not sent, appears as one amber line underneath, and only when there is something.
 */
export function TillTotals({ rows, queued = [] }: { rows: Partial<Record<Cur, TotalsRow>>; queued?: QueuedTotal[] }) {
  return (
    <div className="rounded-xl border bg-background p-4 shadow-xs">
      <h2 className="mb-3 text-sm font-semibold">Sales today</h2>
      <div className="grid grid-cols-2 gap-4">
        {CURRENCIES.map((c) => {
          const row = rows[c];
          const w = waitingFor(row, queued, c);
          return (
            <div key={c} className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">{c}</div>
              <div className="mt-1 text-4xl font-semibold leading-none tabular-nums" aria-label={`${c} invoices today`}>
                {row ? row.fiscalised.count : "–"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{row?.fiscalised.count === 1 ? "invoice" : "invoices"}</div>
              <div className="mt-2 truncate text-2xl font-semibold tabular-nums">{row ? money(row.fiscalised.total) : "–"}</div>
              {w.count > 0 && (
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 tabular-nums dark:bg-amber-950/40 dark:text-amber-200">
                  {w.count} waiting · {money(w.total)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {CURRENCIES.some((c) => (rows[c]?.credit?.count ?? 0) > 0) && (
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          Credit notes today:{" "}
          {CURRENCIES.filter((c) => (rows[c]?.credit?.count ?? 0) > 0)
            .map((c) => `${c} ${money(rows[c]!.credit!.total)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function Tile({ title, tone, children }: { title: string; tone?: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "warn" && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
        tone === "bad" && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 space-y-0.5 tabular-nums">{children}</div>
    </div>
  );
}

const Line = ({ c, count, total }: { c: Cur; count: number; total?: number }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-xs text-muted-foreground">{c}</span>
    <span className="text-lg font-semibold leading-tight">
      {count}
      {total !== undefined && <span className="ml-2 text-sm font-medium text-muted-foreground">{money(total)}</span>}
    </span>
  </div>
);

/** The heading of the sales screens: everything side by side, so nothing unfiscalised can hide. */
export function SalesTiles({ rows, queued = [] }: { rows: Partial<Record<Cur, TotalsRow>>; queued?: QueuedTotal[] }) {
  const waiting = CURRENCIES.map((c) => ({ c, ...waitingFor(rows[c], queued, c) }));
  const anyWaiting = waiting.some((w) => w.count > 0);
  const issues = CURRENCIES.reduce((n, c) => n + (rows[c]?.failed ?? 0) + (rows[c]?.voided ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Totals">
      <Tile title="Fiscalised">
        {CURRENCIES.map((c) => (
          <Line key={c} c={c} count={rows[c]?.fiscalised.count ?? 0} total={rows[c]?.fiscalised.total ?? 0} />
        ))}
      </Tile>
      <Tile title="Waiting for ZIMRA" tone={anyWaiting ? "warn" : undefined}>
        {waiting.map((w) => (
          <Line key={w.c} c={w.c} count={w.count} total={w.total} />
        ))}
      </Tile>
      <Tile title="Credit notes">
        {CURRENCIES.map((c) => (
          <Line key={c} c={c} count={rows[c]?.credit?.count ?? 0} total={rows[c]?.credit?.total ?? 0} />
        ))}
      </Tile>
      <Tile title="Failed or voided" tone={issues > 0 ? "bad" : undefined}>
        {CURRENCIES.map((c) => (
          <Line key={c} c={c} count={(rows[c]?.failed ?? 0) + (rows[c]?.voided ?? 0)} />
        ))}
      </Tile>
    </div>
  );
}
