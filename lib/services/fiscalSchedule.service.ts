import { formatInTimeZone } from "date-fns-tz";
import { correctedNow, currentSkew, describeSkew, SKEW_WARN_MS } from "@/lib/clockSkew";
import { fiscalBackend } from "@/lib/fiscal/client";

import {
  CENTRAL_KEY,
  listScheduledDevices,
  resolveDeviceByKey,
  setDeviceLastAutoCloseDate,
  setDeviceLastAutoOpenDate,
} from "@/lib/services/fiscalDevice.service";
import {
  getFiscalSettingsDoc,
  setLastAutoCloseDate,
  setLastAutoOpenDate,
} from "@/lib/services/fiscalSettings.service";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";
import { checkFiscalDayStatus } from "@/lib/services/zimraFiscal.service";
import {
  CloseInProgressError,
  closeFiscalDayWithReport,
  FiscalCloseError,
  openFiscalDayOnly,
  PendingPosSalesError,
  ReviewRequiredError,
} from "@/lib/services/fiscalDayOps.service";

function timeMatches(stored: string, hm: string): boolean {
  return stored.trim() === hm;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.trim().split(":").map(Number);
  return h * 60 + m;
}

/** How long after the configured close time the day may stay open while POS sales are being fiscalised. */
const CLOSE_DEFER_MAX_MIN = 120;
/** After the deferral window the close is forced; if ZIMRA still refuses it, keep retrying this much longer. */
const FORCED_RETRY_MAX_MIN = 180;
/** Tell the administrators when a close has been blocked this long. */
const ALERT_AFTER_MIN = 30;

function weekdayMatches(isoDow: number, weekdays: number[]): boolean {
  if (!weekdays.length) return false;
  return weekdays.includes(isoDow);
}

/** The schedule fields and run markers shared by the central settings and every FiscalDevice. */
interface ScheduleState {
  autoScheduleEnabled: boolean;
  autoCloseEnabled: boolean;
  autoOpenEnabled: boolean;
  closeTime?: string;
  openTime?: string;
  timezone?: string;
  closeWeekdays?: number[];
  openWeekdays?: number[];
  lastAutoCloseDate?: string;
  lastAutoOpenDate?: string;
}

interface ScheduleTarget {
  key: string;
  name: string;
  load: () => Promise<ScheduleState>;
  markClosed: (date: string) => Promise<void>;
  markOpened: (date: string) => Promise<void>;
}

export interface ScheduleTickResult {
  closed: boolean;
  opened: boolean;
  messages: string[];
}

export interface CloseDue {
  /** The calendar day whose close is owed (yesterday when the close time has not come round yet today). */
  dueDate: string;
  /** Minutes since that close time. */
  minutesSince: number;
}

/**
 * Is a scheduled close owed right now? It stays owed, across midnight, until a close has been recorded for
 * its day, so a day left open by an outage is still closed as soon as ZIMRA is reachable again.
 * Returns null when nothing is owed (not a close weekday, or this day's close is already recorded).
 */
export function closeDue(
  now: Date,
  p: { tz: string; closeTime: string; weekdays: number[]; lastAutoCloseDate?: string | null }
): CloseDue | null {
  const hm = formatInTimeZone(now, p.tz, "HH:mm");
  const today = formatInTimeZone(now, p.tz, "yyyy-MM-dd");
  const isoDow = Number(formatInTimeZone(now, p.tz, "i"));
  const closeMin = toMinutes(p.closeTime);
  const nowMin = toMinutes(hm);

  let dueDate = today;
  let dueDow = isoDow;
  let minutesSince = nowMin - closeMin;
  if (nowMin < closeMin) {
    dueDate = formatInTimeZone(new Date(now.getTime() - 86_400_000), p.tz, "yyyy-MM-dd");
    dueDow = ((isoDow + 5) % 7) + 1;
    minutesSince = nowMin + 1440 - closeMin;
  }
  if (!weekdayMatches(dueDow, p.weekdays)) return null;
  if ((p.lastAutoCloseDate ?? "") >= dueDate) return null;
  return { dueDate, minutesSince };
}

/** Every minute while the close is fresh; every ten minutes once it has been owed longer than the retry window. */
export function shouldAttemptClose(minutesSince: number, minuteOfHour: number): boolean {
  if (minutesSince <= CLOSE_DEFER_MAX_MIN + FORCED_RETRY_MAX_MIN) return true;
  return minuteOfHour % 10 === 0;
}

/** Open/close one device's fiscal day when its own schedule says so. */
async function runScheduleForTarget(t: ScheduleTarget, now: Date): Promise<ScheduleTickResult> {
  const messages: string[] = [];
  const doc = await t.load();

  if (!doc.autoScheduleEnabled) {
    return { closed: false, opened: false, messages: ["Auto schedule is off"] };
  }

  const central = t.key === CENTRAL_KEY;
  // The central device keeps its original alert keys; each other device gets its own.
  const alertKey = (kind: string, today: string) => (central ? `${kind}:${today}` : `${kind}:${t.key}:${today}`);
  const label = central ? "Fiscal day" : `Fiscal day (${t.name})`;

  const tz = doc.timezone?.trim() || "Africa/Harare";
  const hm = formatInTimeZone(now, tz, "HH:mm");
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const isoDow = Number(formatInTimeZone(now, tz, "i"));

  const closeWeekdays = doc.closeWeekdays?.length ? doc.closeWeekdays : [1, 2, 3, 4, 5, 6, 7];
  const openWeekdays = doc.openWeekdays?.length ? doc.openWeekdays : [1, 2, 3, 4, 5, 6, 7];

  let closed = false;
  let opened = false;

  const due =
    doc.autoCloseEnabled && doc.closeTime
      ? closeDue(now, { tz, closeTime: doc.closeTime, weekdays: closeWeekdays, lastAutoCloseDate: doc.lastAutoCloseDate })
      : null;
  if (due && shouldAttemptClose(due.minutesSince, Number(hm.slice(3, 5)))) {
    // The close is owed for `due.dueDate`. It is retried until it is recorded, even past midnight.
    const dueDate = due.dueDate;
    try {
      // After the deferral window the day is closed regardless; unfiscalised sales then wait for admin approval.
      // An admin may already have closed it by hand: record that and stop trying.
      const status = await checkFiscalDayStatus(await resolveDeviceByKey(t.key));
      if (!status.isOpen) {
        await t.markClosed(dueDate);
        messages.push(`Fiscal day was already closed (${dueDate} ${hm} ${tz})`);
      } else {
        const overdue = due.minutesSince >= CLOSE_DEFER_MAX_MIN;
        await closeFiscalDayWithReport("scheduled", { force: overdue, deviceKey: t.key });
        await t.markClosed(dueDate);
        closed = true;
        messages.push(`Scheduled fiscal day close OK (${dueDate} ${hm} ${tz})`);
      }
    } catch (e) {
      const waited = due.minutesSince;
      const detail = e instanceof Error ? e.message : String(e);
      if (e instanceof CloseInProgressError) {
        messages.push(`Scheduled close skipped: ${detail}`);
        return { closed, opened, messages };
      }
      if (e instanceof ReviewRequiredError) {
        // Not a device problem: someone must look at the refused receipts. Retrying only re-checks the count.
        messages.push(`Scheduled close held: ${detail}`);
        await sendFiscalAlertOnce(
          alertKey("close-needs-review", dueDate),
          `${label} close is waiting for a review`,
          `The scheduled close${central ? "" : ` of "${t.name}"`} for ${dueDate} has not run.

${detail}

Once the receipts are reviewed the close runs by itself within the minute.`
        );
        return { closed, opened, messages };
      }
      if (e instanceof FiscalCloseError) {
        const code = e.errorCode ?? "unknown reason";
        messages.push(`Scheduled close refused by ZIMRA (${code}): ${detail}`);
        await sendFiscalAlertOnce(
          alertKey(e.permanent ? `close-refused-permanent-${code}` : `close-refused-${code}`, dueDate),
          e.permanent ? `${label} cannot be closed automatically (${code})` : `${label} close was refused (${code})`,
          `ZIMRA refused to close ${central ? "the fiscal day" : `the fiscal day on "${t.name}"`} for ${dueDate}.

Reason: ${code}
${detail}

${
            e.permanent
              ? "A receipt with validation errors cannot be fixed by retrying. Selling can continue, but ZIMRA (portal or an officer) must close this day. Do not keep retrying."
              : "The system will try again. Check Admin > Fiscal Day if this repeats."
          }`
        );
        if (e.permanent) {
          // Retrying cannot fix it. Stop for this day; the alert tells an administrator what to do.
          await t.markClosed(dueDate);
          return { closed, opened, messages };
        }
      }
      const blocked = e instanceof PendingPosSalesError;
      messages.push(
        blocked
          ? `Scheduled close deferred: ${detail} Retrying every minute for up to ${CLOSE_DEFER_MAX_MIN} minutes.`
          : `Scheduled close failed: ${detail}`
      );
      if (waited >= CLOSE_DEFER_MAX_MIN && !blocked) {
        // The forced close itself was refused (for example ZIMRA rejected it): someone must act.
        await sendFiscalAlertOnce(
          alertKey("close-forced-failed", dueDate),
          `${label} could not be closed`,
          `The scheduled close of ${central ? "the fiscal day" : `the fiscal day on "${t.name}"`} for ${dueDate} was forced ${CLOSE_DEFER_MAX_MIN} minutes after ${doc.closeTime} and still failed.

Reason: ${detail}

The system keeps retrying (every minute for ${FORCED_RETRY_MAX_MIN} more minutes, then every 10 minutes) until it closes. If it does not, check Admin > Fiscal Day (receipts waiting to upload) and close the day by hand.`
        );
      } else if (blocked && waited >= ALERT_AFTER_MIN) {
        await sendFiscalAlertOnce(
          alertKey("close-deferred", dueDate),
          `${label} close is being held back`,
          `The scheduled close${central ? "" : ` of "${t.name}"`} for ${dueDate} (${doc.closeTime}) has been held back for ${waited} minutes.

${detail}

It keeps retrying every minute and will be forced after ${CLOSE_DEFER_MAX_MIN} minutes. Check Admin > Fiscal Day.`
        );
      }
    }
  }

  const docAfter = await t.load();
  if (
    docAfter.autoOpenEnabled &&
    docAfter.openTime &&
    weekdayMatches(isoDow, openWeekdays) &&
    timeMatches(docAfter.openTime, hm) &&
    docAfter.lastAutoOpenDate !== today
  ) {
    try {
      await openFiscalDayOnly(t.key);
      await t.markOpened(today);
      opened = true;
      messages.push(`Scheduled fiscal day open OK (${today} ${hm} ${tz})`);
    } catch (e) {
      messages.push(`Scheduled open failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!closed && !opened && messages.length === 0) {
    messages.push("No schedule action for this minute");
  }

  return { closed, opened, messages };
}

/**
 * Open the day when sales are waiting for it. The scheduled open only fires on one exact minute, so a missed
 * tick (server restart, cron hiccup) would otherwise leave every sale unfiscalised until tomorrow.
 * Only acts for a device that is set to open its day automatically, on one of its open weekdays and after
 * its opening time. Returns true when it opened the day. Never throws.
 */
export async function openDayForWaitingSales(deviceKey: string, now = correctedNow()): Promise<boolean> {
  if (fiscalBackend() === "service") return false;
  try {
    const doc: ScheduleState | undefined =
      deviceKey === CENTRAL_KEY
        ? await getFiscalSettingsDoc()
        : (await listScheduledDevices()).find((x) => String(x._id) === deviceKey);
    if (!doc || !doc.autoScheduleEnabled || !doc.autoOpenEnabled) return false;

    const tz = doc.timezone?.trim() || "Africa/Harare";
    const hm = formatInTimeZone(now, tz, "HH:mm");
    const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
    const isoDow = Number(formatInTimeZone(now, tz, "i"));
    const openWeekdays = doc.openWeekdays?.length ? doc.openWeekdays : [1, 2, 3, 4, 5, 6, 7];
    if (!weekdayMatches(isoDow, openWeekdays)) return false;
    if (toMinutes(hm) < toMinutes(doc.openTime || "00:05")) return false;

    await openFiscalDayOnly(deviceKey);
    if (deviceKey === CENTRAL_KEY) await setLastAutoOpenDate(today);
    else await setDeviceLastAutoOpenDate(deviceKey, today);
    return true;
  } catch {
    // Not opening is the normal "device is not ready" outcome; the queue tries again on its next run.
    return false;
  }
}

/**
 * Intended to be triggered every minute (e.g. cron + CRON_SECRET). Mirrors Laravel fiscal:process-schedules.
 * Runs the central device's schedule and each branch device's own schedule independently: a failing
 * device is reported in the messages and never stops the others.
 */
export async function runFiscalScheduleTick(): Promise<ScheduleTickResult> {
  // With the fiscal service in charge it opens and closes days on its own schedule; two schedulers would fight.
  if (fiscalBackend() === "service") return { closed: false, opened: false, messages: ["Fiscal days are opened and closed by the fiscal service"] };
  // ZIMRA's time, not ours, decides when a day opens or closes: a drifting server clock must not cause close errors.
  const now = correctedNow();

  const targets: ScheduleTarget[] = [
    {
      key: CENTRAL_KEY,
      name: "Central device",
      load: () => getFiscalSettingsDoc(),
      markClosed: setLastAutoCloseDate,
      markOpened: setLastAutoOpenDate,
    },
  ];
  for (const d of await listScheduledDevices()) {
    const id = String(d._id);
    targets.push({
      key: id,
      name: d.name,
      // Re-read each time so the open step sees a close/open marker written moments earlier.
      load: async () => (await listScheduledDevices()).find((x) => String(x._id) === id) ?? { ...d.toObject(), autoScheduleEnabled: false },
      markClosed: (date) => setDeviceLastAutoCloseDate(id, date),
      markOpened: (date) => setDeviceLastAutoOpenDate(id, date),
    });
  }

  const settled = await Promise.allSettled(targets.map((t) => runScheduleForTarget(t, now)));
  const messages: string[] = [];
  let closed = false;
  let opened = false;
  settled.forEach((r, i) => {
    const prefix = targets[i].key === CENTRAL_KEY ? "" : `[${targets[i].name}] `;
    if (r.status === "fulfilled") {
      closed ||= r.value.closed;
      opened ||= r.value.opened;
      // Branch devices that are off or idle would add noise every minute.
      const quiet = targets[i].key !== CENTRAL_KEY;
      for (const m of r.value.messages) {
        if (quiet && (m === "Auto schedule is off" || m === "No schedule action for this minute")) continue;
        messages.push(prefix + m);
      }
    } else {
      messages.push(`${prefix}Schedule failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  const skew = currentSkew();
  if (skew && Math.abs(skew.skewMs) >= SKEW_WARN_MS) {
    const text = describeSkew(skew.skewMs);
    messages.push(`Clock check: ${text}`);
    await sendFiscalAlertOnce(
      `clock-skew:${formatInTimeZone(now, "Africa/Harare", "yyyy-MM-dd")}`,
      "The server clock does not match ZIMRA's",
      `${text[0].toUpperCase()}${text.slice(1)}.

The fiscal day is opened and closed by ZIMRA's time, so the schedule still runs on time, but a wrong clock can cause receipts to be refused. Check that the server's time is set automatically (NTP) and correct.`
    );
  }
  if (!messages.length) messages.push("No schedule action for this minute");
  return { closed, opened, messages };
}
