/**
 * Clock skew against ZIMRA: how it is estimated, which estimate is kept, when the corrected time is used.
 * Pure logic, no network. Run: npx tsx scripts/test-clock-skew.ts
 */
import assert from "node:assert/strict";

import { correctedNow, currentSkew, describeSkew, estimateSkewMs, learnServerClock, resetClockSkew, SKEW_WARN_MS } from "@/lib/clockSkew";

let n = 0;
const ok = (name: string, fn: () => void) => {
  resetClockSkew();
  fn();
  n++;
  console.log("ok  ", name);
};

const T = Date.parse("2026-11-10T10:00:00Z");
const hdr = (ms: number) => new Date(ms).toUTCString(); // an HTTP Date header, whole seconds

ok("a server in step with us gives about zero", () => {
  // sent at 10:00:00.200, reply took 100 ms, server stamped 10:00:00 (rounded down)
  const s = estimateSkewMs(hdr(T), T + 200, T + 300);
  assert.ok(s !== null && Math.abs(s) <= 1000, String(s));
});

ok("a server a minute ahead of us is seen as a minute", () => {
  const s = estimateSkewMs(hdr(T + 60_000), T + 200, T + 300)!;
  assert.ok(Math.abs(s - 60_000) <= 1000, String(s));
});

ok("a server behind us gives a negative value", () => {
  const s = estimateSkewMs(hdr(T - 5 * 60_000), T + 200, T + 300)!;
  assert.ok(s < -290_000 && s > -310_000, String(s));
});

ok("a missing or broken header teaches nothing", () => {
  assert.equal(estimateSkewMs(undefined, T, T + 50), null);
  assert.equal(estimateSkewMs("not a date", T, T + 50), null);
});

ok("a very slow reply teaches nothing", () => {
  assert.equal(estimateSkewMs(hdr(T), T, T + 15_000), null);
});

ok("an impossible difference (a broken header) is never acted on", () => {
  assert.equal(estimateSkewMs(hdr(T + 48 * 3_600_000), T, T + 50), null);
});

/** A reply from a server whose clock is `skew` ms ahead of ours, sent at local time `sent`, taking `rtt` ms. */
const reply = (sent: number, rtt: number, skew: number) => learnServerClock(hdr(sent + rtt / 2 + skew), sent, sent + rtt, sent + rtt);

ok("the fastest reply is the one that is kept", () => {
  reply(T, 3_000, 60_000); // slow, rough
  reply(T + 10_000, 40, 60_000); // fast
  reply(T + 20_000, 4_000, 90_000); // slow again, and wrong: ignored
  const s = currentSkew(T + 25_000)!;
  assert.equal(s.rttMs, 40);
  assert.ok(Math.abs(s.skewMs - 60_000) <= 1000, String(s.skewMs));
});

ok("an old estimate is dropped and replaced by any new one", () => {
  reply(T, 40, 60_000);
  assert.equal(currentSkew(T + 31 * 60_000), null);
  reply(T + 40 * 60_000, 500, 60_000);
  assert.ok(currentSkew(T + 41 * 60_000) !== null);
});

ok("corrected time follows ZIMRA when the difference matters, and the local clock when it does not", () => {
  learnServerClock(hdr(T + 120_000), T, T + 40, T + 40);
  const c = correctedNow(T + 1_000).getTime();
  assert.ok(Math.abs(c - (T + 1_000 + 120_000)) <= 1000, String(c - T));

  resetClockSkew();
  learnServerClock(hdr(T), T, T + 40, T + 40); // within a second
  assert.equal(correctedNow(T + 1_000).getTime(), T + 1_000);

  resetClockSkew();
  assert.equal(correctedNow(T + 1_000).getTime(), T + 1_000, "no estimate: local clock");
});

ok("the warning threshold is 30 seconds and the message says which way", () => {
  assert.equal(SKEW_WARN_MS, 30_000);
  assert.match(describeSkew(90_000), /behind/);
  assert.match(describeSkew(-90_000), /ahead/);
  assert.match(describeSkew(300_000), /5 minutes/);
});

console.log(`\n${n} checks passed`);
