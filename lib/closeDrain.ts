/** The "send waiting sales one at a time" loop used before a fiscal day closes. No database access, so it can be tested alone. */

const DEFAULT_BUDGET_MS = 4 * 60_000;
const MAX_STALLED_PASSES = 3;
const BACKOFF_MS = [2_000, 5_000, 10_000];

export interface DrainDeps {
  /** Oldest first. Called again after every pass so sales made during the drain are included. */
  listWaiting: () => Promise<{ id: string }[]>;
  /** Try one sale. Resolves with its status afterwards. Must not throw for device problems. */
  fiscaliseOne: (id: string) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Called after each sale: done so far, and how many were waiting at the start of this pass. */
  onProgress?: (sent: number, total: number) => Promise<void> | void;
  budgetMs?: number;
}

export interface DrainResult {
  sent: number;
  /** Still waiting when the drain stopped. */
  remaining: number;
  /** Stopped because nothing went through for several passes (device or network down), or the time ran out. */
  gaveUp: "device" | "time" | null;
}

/**
 * Send waiting sales one at a time until none are left. A pass in which nothing went through waits a little and
 * tries again; after three such passes the device is treated as down and the drain stops, so a close that cannot
 * succeed does not hold the lock. The caller decides whether to close anyway.
 */
export async function runDrain(deps: DrainDeps): Promise<DrainResult> {
  const budget = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = deps.now();
  let sent = 0;
  let stalled = 0;
  let total = 0;
  for (;;) {
    const waiting = await deps.listWaiting();
    if (waiting.length === 0) return { sent, remaining: 0, gaveUp: null };
    if (deps.now() - started > budget) return { sent, remaining: waiting.length, gaveUp: "time" };
    total = Math.max(total, sent + waiting.length);

    let progressed = 0;
    for (const w of waiting) {
      if (deps.now() - started > budget) break;
      const status = await deps.fiscaliseOne(w.id);
      // FISCALISED went through. FAILED was refused outright: it leaves the queue and is set aside by the close.
      if (status === "FISCALISED" || status === "FAILED" || status === "VOIDED") {
        progressed++;
        if (status === "FISCALISED") sent++;
        await deps.onProgress?.(sent, total);
      }
    }
    if (progressed === 0) {
      stalled++;
      if (stalled >= MAX_STALLED_PASSES) return { sent, remaining: (await deps.listWaiting()).length, gaveUp: "device" };
      await deps.sleep(BACKOFF_MS[Math.min(stalled - 1, BACKOFF_MS.length - 1)]);
    } else {
      stalled = 0;
    }
  }
}
