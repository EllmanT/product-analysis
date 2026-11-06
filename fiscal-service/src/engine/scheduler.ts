/**
 * Opens and closes each device's fiscal day by its own schedule (time of day in its own time zone).
 *
 * The rules that keep this from causing close-day errors:
 *  - a step is marked done only when it SUCCEEDED, so a failure is tried again;
 *  - retries are spaced (default 5 minutes), never every tick;
 *  - a close that cannot succeed by retrying (ZIMRA flagged a receipt) is not retried at all; the engine has
 *    already raised the alert;
 *  - a day that stays open close to ZIMRA's maximum length raises an alert, once, because past it ZIMRA stops
 *    accepting receipts.
 * The clock is injectable so the schedule can be tested without waiting.
 */
import type { DeviceSafe, DeviceRegistry } from "../devices/registry.js";
import type { EngineManager } from "./manager.js";

export interface SchedulerDeps {
  registry: DeviceRegistry;
  manager: EngineManager;
  now?: () => Date;
  /** Minimum time between attempts of the same step on the same device. */
  retryEveryMs?: number;
  /** Hours after which a still-open day raises an alert (ZIMRA's limit is usually 24). */
  dayLengthWarnHrs?: number;
}

export interface TickEvent {
  deviceId: number;
  step: "open" | "close" | "warn";
  ok: boolean;
  message: string;
}

function localParts(d: Date, tz: string): { date: string; hm: string; dow: number } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p["weekday"]!) + 1;
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, hm: `${p["hour"]}:${p["minute"]}`, dow };
}

export class Scheduler {
  private readonly lastTry = new Map<string, number>();
  private readonly gaveUp = new Set<string>();
  private readonly warned = new Set<string>();
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
      const results = await Promise.all(devices.map((d) => this.tickDevice(d).catch((e): TickEvent[] => [{ deviceId: d.deviceId, step: "open", ok: false, message: e instanceof Error ? e.message : String(e) }])));
      return results.flat();
    } finally {
      this.running = false;
    }
  }

  private async tickDevice(d: DeviceSafe): Promise<TickEvent[]> {
    const s = d.schedule!;
    const events: TickEvent[] = [];
    const { date, hm, dow } = localParts(this.now(), s.timezone);
    if (s.weekdays.length && !s.weekdays.includes(dow)) return events;
    const engine = await this.deps.manager.get(d.id);
    const st = await engine.status();

    // Open: from the open time until the close time, once a day.
    if (hm >= s.openTime && hm < s.closeTime && s.lastOpenDate !== date && !st.dayOpen && this.due(`${d.id}:open:${date}`)) {
      try {
        const r = await engine.openDay();
        await this.deps.registry.markScheduleRun(d.id, "open", date);
        events.push({ deviceId: d.deviceId, step: "open", ok: true, message: `Opened fiscal day ${r.fiscalDayNo}` });
      } catch (e) {
        events.push({ deviceId: d.deviceId, step: "open", ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    } else if (hm >= s.openTime && s.lastOpenDate !== date && st.dayOpen) {
      // Already open (opened by hand or adopted): nothing to do, but do not try again today.
      await this.deps.registry.markScheduleRun(d.id, "open", date);
    }

    // Close: from the close time on, once a day, only if a day is open.
    const key = `${d.id}:close:${date}`;
    if (hm >= s.closeTime && s.lastCloseDate !== date && st.dayOpen && !this.gaveUp.has(key) && this.due(key)) {
      const r = await engine.closeDay();
      if (r.ok) {
        await this.deps.registry.markScheduleRun(d.id, "close", date);
        events.push({ deviceId: d.deviceId, step: "close", ok: true, message: `Closed fiscal day ${r.fiscalDayNo}` });
      } else {
        if (r.permanent) this.gaveUp.add(key); // retrying cannot help; the engine has alerted
        events.push({ deviceId: d.deviceId, step: "close", ok: false, message: `${r.reason}: ${r.message}${r.permanent ? " (will not be retried)" : ""}` });
      }
    }

    // A day left open too long: ZIMRA stops accepting receipts at its limit.
    const warnAfter = (this.deps.dayLengthWarnHrs ?? 22) * 3_600_000;
    if (st.dayOpenedAt && this.now().getTime() - st.dayOpenedAt > warnAfter && !this.warned.has(`${d.id}:${st.fiscalDayNo}`)) {
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
