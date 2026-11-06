/**
 * Opens and closes each device's fiscal day by its own schedule (time of day in its own time zone).
 *
 * The rules that keep this from causing close-day errors:
 *  - a step is marked done only when it SUCCEEDED, so a failure is tried again;
 *  - retries are spaced (default 5 minutes), never every tick;
 *  - a close is owed until it is recorded, across midnight, so a day left open by an outage is closed as soon as
 *    ZIMRA answers again (and a day opened AFTER the close time is never closed by an old, missed close);
 *  - a close that cannot succeed by retrying (ZIMRA flagged a receipt) is not retried at all; the engine has
 *    already raised the alert;
 *  - a day that stays open close to ZIMRA's maximum length is recovered: close it, then open a new one straight
 *    away, so the sales waiting behind the outage can be fiscalised in a fresh day;
 *  - a day that has already passed ZIMRA's limit may be refused a close; the event then says it must be closed on
 *    the ZIMRA portal, and the new day opens by itself once it is.
 * The clock is injectable so the schedule can be tested without waiting.
 */
import type { DeviceSafe, DeviceRegistry, DeviceSchedule } from "../devices/registry.js";
import type { EngineManager } from "./manager.js";

export interface SchedulerDeps {
  registry: DeviceRegistry;
  manager: EngineManager;
  now?: () => Date;
  /** Minimum time between attempts of the same step on the same device. */
  retryEveryMs?: number;
  /** Hours after which a still-open day raises an alert (ZIMRA's limit is usually 24). */
  dayLengthWarnHrs?: number;
  /** Hours after which a still-open day is closed and replaced, whatever the schedule says. Must stay under ZIMRA's limit. */
  recoverAfterHrs?: number;
}

export interface TickEvent {
  deviceId: number;
  step: "open" | "close" | "warn" | "recover";
  ok: boolean;
  message: string;
}

export function localParts(d: Date, tz: string): { date: string; hm: string; dow: number } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p["weekday"]!) + 1;
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, hm: `${p["hour"]}:${p["minute"]}`, dow };
}

/**
 * Is a scheduled close owed right now? It stays owed, across midnight, until a close is recorded for its day.
 * `openedAt` is when the open day was opened: a day opened after the owed close time is a new day and is left alone.
 * Returns the calendar day the close is owed for, or null.
 */
export function closeOwed(now: Date, s: DeviceSchedule, openedAt?: number): { dueDate: string } | null {
  // A day cannot have opened in the future; if it looks that way the open time is not trustworthy, so ignore it.
  if (openedAt !== undefined && openedAt > now.getTime()) openedAt = undefined;
  const { date, hm, dow } = localParts(now, s.timezone);
  let dueDate = date;
  let dueDow = dow;
  if (hm < s.closeTime) {
    dueDate = localParts(new Date(now.getTime() - 86_400_000), s.timezone).date;
    dueDow = ((dow + 5) % 7) + 1;
  }
  if (s.weekdays.length && !s.weekdays.includes(dueDow)) return null;
  if ((s.lastCloseDate ?? "") >= dueDate) return null;
  // Without knowing when the day opened, a close owed from before midnight could hit a day opened this morning.
  if (openedAt === undefined && dueDate !== date) return null;
  if (openedAt !== undefined) {
    const o = localParts(new Date(openedAt), s.timezone);
    if (`${o.date} ${o.hm}` >= `${dueDate} ${s.closeTime}`) return null;
  }
  return { dueDate };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Scheduler {
  private readonly lastTry = new Map<string, number>();
  private readonly gaveUp = new Set<string>();
  private readonly warned = new Set<string>();
  /** Devices whose stale day was closed but whose new day could not be opened yet. */
  private readonly reopen = new Set<string>();
  private running = false;

  constructor(private readonly deps: SchedulerDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private due(key: string): boolean {
    const last = this.lastTry.get(key) ?? 0;
    if (this.now().getTime() - last < (this.deps.retryEveryMs ?? 5 * 60_000)) return false;
    this.lastTry.set(key, this.now().getTime());
    return true;
  }

  /** One pass over every scheduled device. Devices are independent: one failing never stops another. */
  async tick(): Promise<TickEvent[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const devices = await this.deps.registry.scheduled();
      const results = await Promise.all(devices.map((d) => this.tickDevice(d).catch((e): TickEvent[] => [{ deviceId: d.deviceId, step: "open", ok: false, message: msg(e) }])));
      return results.flat();
    } finally {
      this.running = false;
    }
  }

  private async tickDevice(d: DeviceSafe): Promise<TickEvent[]> {
    const s = d.schedule!;
    const events: TickEvent[] = [];
    const now = this.now();
    const { date, hm, dow } = localParts(now, s.timezone);
    const engine = await this.deps.manager.get(d.id);
    let st = await engine.status();

    const staleAfterMs = (this.deps.recoverAfterHrs ?? 23) * 3_600_000;
    const stale = st.dayOpen && !!st.dayOpenedAt && now.getTime() - st.dayOpenedAt > staleAfterMs;
    const openToday = !s.weekdays.length || s.weekdays.includes(dow);

    // A stale day was closed earlier but the new one did not open: keep trying, whatever the time of day.
    if (this.reopen.has(d.id) && !st.dayOpen && this.due(`${d.id}:reopen`)) {
      try {
        const r = await engine.openDay();
        this.reopen.delete(d.id);
        await this.deps.registry.markScheduleRun(d.id, "open", date);
        events.push({ deviceId: d.deviceId, step: "recover", ok: true, message: `Opened fiscal day ${r.fiscalDayNo} after recovering a stale day` });
        st = await engine.status();
      } catch (e) {
        events.push({ deviceId: d.deviceId, step: "recover", ok: false, message: `Could not open a new fiscal day yet: ${msg(e)}` });
      }
    } else if (this.reopen.has(d.id) && st.dayOpen) {
      this.reopen.delete(d.id);
    }

    // Open: from the open time until the close time, once a day.
    if (openToday && hm >= s.openTime && hm < s.closeTime && s.lastOpenDate !== date && !st.dayOpen && !this.reopen.has(d.id) && this.due(`${d.id}:open:${date}`)) {
      try {
        const r = await engine.openDay();
        await this.deps.registry.markScheduleRun(d.id, "open", date);
        events.push({ deviceId: d.deviceId, step: "open", ok: true, message: `Opened fiscal day ${r.fiscalDayNo}` });
        st = await engine.status();
      } catch (e) {
        events.push({ deviceId: d.deviceId, step: "open", ok: false, message: msg(e) });
      }
    } else if (openToday && hm >= s.openTime && s.lastOpenDate !== date && st.dayOpen) {
      // Already open (opened by hand or adopted): nothing to do, but do not try again today.
      await this.deps.registry.markScheduleRun(d.id, "open", date);
    }

    // Close: owed from the close time on until it is recorded, even after midnight, only if a day is open.
    let closedNow = false;
    let attemptedClose = false;
    const owed = st.dayOpen ? closeOwed(now, s, st.dayOpenedAt) : null;
    if (owed) {
      const key = `${d.id}:close:${owed.dueDate}`;
      if (!this.gaveUp.has(key) && this.due(key)) {
        attemptedClose = true;
        const r = await engine.closeDay();
        if (r.ok) {
          closedNow = true;
          await this.deps.registry.markScheduleRun(d.id, "close", owed.dueDate);
          events.push({ deviceId: d.deviceId, step: "close", ok: true, message: `Closed fiscal day ${r.fiscalDayNo}` });
        } else {
          if (r.permanent) this.gaveUp.add(key); // retrying cannot help; the engine has alerted
          events.push({ deviceId: d.deviceId, step: "close", ok: false, message: `${r.reason}: ${r.message}${r.permanent ? " (will not be retried)" : ""}` });
        }
      }
    }

    // A day left open close to ZIMRA's limit: close it even if the schedule did not ask, so a new one can open.
    if (stale && !closedNow && !attemptedClose && st.dayOpen) {
      const key = `${d.id}:recover:${st.fiscalDayNo}`;
      if (!this.gaveUp.has(key) && this.due(key)) {
        const r = await engine.closeDay();
        if (r.ok) {
          closedNow = true;
          await this.deps.registry.markScheduleRun(d.id, "close", date);
          events.push({ deviceId: d.deviceId, step: "recover", ok: true, message: `Closed stale fiscal day ${r.fiscalDayNo}` });
        } else {
          if (r.permanent) this.gaveUp.add(key);
          events.push({
            deviceId: d.deviceId,
            step: "recover",
            ok: false,
            message: `Could not close fiscal day ${st.fiscalDayNo}, open for over ${this.deps.recoverAfterHrs ?? 23} hours (${r.reason}: ${r.message}). If ZIMRA refuses it because the day is too old, close it on the ZIMRA portal; a new day opens by itself afterwards.`,
          });
        }
      }
    }

    // A stale day was closed this tick: open the new one at once so waiting sales can be fiscalised.
    if (stale && closedNow) {
      try {
        const r = await engine.openDay();
        await this.deps.registry.markScheduleRun(d.id, "open", date);
        events.push({ deviceId: d.deviceId, step: "recover", ok: true, message: `Opened fiscal day ${r.fiscalDayNo} after closing a stale day` });
        st = await engine.status();
      } catch (e) {
        this.reopen.add(d.id);
        events.push({ deviceId: d.deviceId, step: "recover", ok: false, message: `Closed the stale day but could not open a new one yet: ${msg(e)}` });
      }
    }

    // A day left open too long: ZIMRA stops accepting receipts at its limit.
    const warnAfter = (this.deps.dayLengthWarnHrs ?? 22) * 3_600_000;
    if (st.dayOpenedAt && st.dayOpen && now.getTime() - st.dayOpenedAt > warnAfter && !this.warned.has(`${d.id}:${st.fiscalDayNo}`)) {
      this.warned.add(`${d.id}:${st.fiscalDayNo}`);
      events.push({ deviceId: d.deviceId, step: "warn", ok: false, message: `Fiscal day ${st.fiscalDayNo} has been open for over ${this.deps.dayLengthWarnHrs ?? 22} hours` });
    }
    return events;
  }

  start(everyMs = 30_000): () => void {
    const t = setInterval(() => void this.tick().catch(() => undefined), everyMs);
    t.unref();
    return () => clearInterval(t);
  }
}
