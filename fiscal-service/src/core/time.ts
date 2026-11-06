/**
 * Wall-clock parts of a date in the fiscal time zone, independent of the machine's own zone.
 *
 * ZIMRA dates (receiptDate, fiscalDayOpened, the fiscal day date, the QR date) are local Zimbabwe time with no
 * zone marker. The original library used the host's local getters, which is only right when the host happens to
 * run in Zimbabwe. The service must give the same strings wherever it is deployed, so the zone is explicit.
 * Default Africa/Harare (UTC+2, no daylight saving); change it with setFiscalTimeZone().
 */
let zone = "Africa/Harare";
let formatter = build(zone);

function build(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function setFiscalTimeZone(tz: string): void {
  formatter = build(tz); // throws RangeError on an unknown zone, leaving the old one in place
  zone = tz;
}

export function fiscalTimeZone(): string {
  return zone;
}

export interface WallClock {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

export function wallClock(d: Date): WallClock {
  const out: Record<string, string> = {};
  for (const p of formatter.formatToParts(d)) if (p.type !== "literal") out[p.type] = p.value;
  return out as unknown as WallClock;
}

/** The instant a zone-less ZIMRA date-time ("2026-10-25T14:30:05") means in the fiscal time zone. */
export function parseFdmsDateTime(text: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) throw new Error(`Not an FDMS date-time: ${text}`);
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  // Find the instant whose Harare wall clock reads `wall`; two passes settle any offset, including daylight saving.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(guess));
    const shown = Date.UTC(+w.year, +w.month - 1, +w.day, +w.hour, +w.minute, +w.second);
    guess -= shown - wall;
  }
  return new Date(guess);
}
