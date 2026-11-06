/**
 * Knowing how far this server's clock is from ZIMRA's, so a drifting clock never decides when a fiscal day opens
 * or closes. Pure logic with module-level memory; no imports so it is easy to test.
 *
 * Every reply from ZIMRA carries a `Date` header. The best estimate comes from the reply that came back fastest,
 * because the shorter the round trip the less the header can be wrong by.
 */

/** A difference this big is worth telling an administrator about. */
export const SKEW_WARN_MS = 30_000;
/** Below this the local clock is trusted as it is: the header only has one second of resolution. */
const SKEW_IGNORE_MS = 2_000;
/** A reply slower than this says little about the time. */
const MAX_RTT_MS = 10_000;
/** A difference this big is a broken header or a wrong date, not drift. Never act on it. */
const MAX_PLAUSIBLE_MS = 6 * 3_600_000;
/** An estimate older than this is no longer trusted. */
const MAX_AGE_MS = 30 * 60_000;

/**
 * How far the server is ahead of this machine (positive: this machine's clock is slow), or null if the reply
 * cannot tell us. `sentAt` and `receivedAt` are local times around the request.
 */
export function estimateSkewMs(serverDate: string | undefined, sentAt: number, receivedAt: number): number | null {
  if (!serverDate) return null;
  const server = Date.parse(serverDate);
  if (!Number.isFinite(server)) return null;
  const rtt = receivedAt - sentAt;
  if (rtt < 0 || rtt > MAX_RTT_MS) return null;
  // The header is rounded down to the second and names the moment the server built the reply, somewhere inside the
  // round trip: aim for the middle of both.
  const skew = server + 500 - (sentAt + rtt / 2);
  return Math.abs(skew) > MAX_PLAUSIBLE_MS ? null : Math.round(skew);
}

interface Sample {
  skewMs: number;
  rttMs: number;
  at: number;
}

let best: Sample | null = null;

/** Remember what a reply taught us. A faster reply replaces a slower one; an old estimate is always replaced. */
export function learnServerClock(serverDate: string | undefined, sentAt: number, receivedAt: number, nowMs = Date.now()): void {
  const skewMs = estimateSkewMs(serverDate, sentAt, receivedAt);
  if (skewMs === null) return;
  const sample: Sample = { skewMs, rttMs: receivedAt - sentAt, at: nowMs };
  if (!best || nowMs - best.at > MAX_AGE_MS || sample.rttMs <= best.rttMs) best = sample;
}

/** The current estimate, or null when there is none or it is old. */
export function currentSkew(nowMs = Date.now()): { skewMs: number; rttMs: number; ageMs: number } | null {
  if (!best || nowMs - best.at > MAX_AGE_MS) return null;
  return { skewMs: best.skewMs, rttMs: best.rttMs, ageMs: nowMs - best.at };
}

/** "Now" as ZIMRA sees it when we have a trustworthy estimate and the difference matters; otherwise the local clock. */
export function correctedNow(nowMs = Date.now()): Date {
  const s = currentSkew(nowMs);
  if (!s || Math.abs(s.skewMs) < SKEW_IGNORE_MS) return new Date(nowMs);
  return new Date(nowMs + s.skewMs);
}

export function describeSkew(skewMs: number): string {
  const secs = Math.round(Math.abs(skewMs) / 1000);
  const span = secs >= 120 ? `${Math.round(secs / 60)} minutes` : `${secs} seconds`;
  return skewMs > 0 ? `this server's clock is ${span} behind ZIMRA's` : `this server's clock is ${span} ahead of ZIMRA's`;
}

/** Forget everything. For tests. */
export function resetClockSkew(): void {
  best = null;
}
