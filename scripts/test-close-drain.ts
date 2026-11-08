/** The loop that sends waiting sales before a day closes. Run: npx tsx scripts/test-close-drain.ts */
import assert from "node:assert/strict";

import { runDrain } from "@/lib/closeDrain";

function harness(statuses: Record<string, string[]>, opts: { budgetMs?: number } = {}) {
  const waiting = new Set(Object.keys(statuses));
  const calls: string[] = [];
  let clock = 0;
  const sleeps: number[] = [];
  const progress: [number, number][] = [];
  return {
    calls,
    sleeps,
    progress,
    run: () =>
      runDrain({
        listWaiting: async () => [...waiting].map((id) => ({ id })),
        fiscaliseOne: async (id) => {
          calls.push(id);
          clock += 100;
          const next = statuses[id].length > 1 ? statuses[id].shift()! : statuses[id][0];
          if (next === "FISCALISED" || next === "FAILED") waiting.delete(id);
          return next;
        },
        sleep: async (ms) => {
          sleeps.push(ms);
          clock += ms;
        },
        now: () => clock,
        onProgress: (s, t) => {
          progress.push([s, t]);
        },
        budgetMs: opts.budgetMs,
      }),
  };
}

async function main() {
  // Everything goes through, one at a time, oldest first.
  let h = harness({ a: ["FISCALISED"], b: ["FISCALISED"], c: ["FISCALISED"] });
  let r = await h.run();
  assert.deepEqual(h.calls, ["a", "b", "c"]);
  assert.deepEqual(r, { sent: 3, remaining: 0, gaveUp: null });
  assert.deepEqual(h.progress.at(-1), [3, 3], "progress ends at 3 of 3");

  // A sale that fails twice and then goes through is retried after a pause, and the day can close.
  h = harness({ a: ["FISCALISED"], b: ["UNFISCALISED", "UNFISCALISED", "FISCALISED"] });
  r = await h.run();
  assert.equal(r.remaining, 0);
  assert.equal(r.sent, 2);
  assert.deepEqual(h.sleeps, [2_000], "one pause, then it goes through");

  // The device is down: three passes with nothing sent, then it stops and says why.
  h = harness({ a: ["UNFISCALISED"], b: ["UNKNOWN"] });
  r = await h.run();
  assert.equal(r.sent, 0);
  assert.equal(r.remaining, 2);
  assert.equal(r.gaveUp, "device");
  assert.equal(h.calls.length, 6, "each sale is tried once per pass, three passes");

  // A receipt ZIMRA refuses outright leaves the queue and does not hold the others back.
  h = harness({ a: ["FAILED"], b: ["FISCALISED"] });
  r = await h.run();
  assert.deepEqual(r, { sent: 1, remaining: 0, gaveUp: null });

  // Out of time: stops with what is left instead of running forever.
  h = harness({ a: ["UNFISCALISED", "FISCALISED"], b: ["FISCALISED"] }, { budgetMs: 1 });
  r = await h.run();
  assert.equal(r.gaveUp, "time");

  // Nothing waiting: nothing is called.
  h = harness({});
  r = await h.run();
  assert.deepEqual(r, { sent: 0, remaining: 0, gaveUp: null });
  assert.equal(h.calls.length, 0);

  console.log("ok: close drain");
}

void main();
