import { formatInTimeZone } from "date-fns-tz";
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

  if (
    doc.autoCloseEnabled &&
    doc.closeTime &&
    weekdayMatches(isoDow, closeWeekdays) &&
    // At the close time, and on every later minute of the deferral window until it succeeds.
    toMinutes(hm) >= toMinutes(doc.closeTime) &&
    toMinutes(hm) - toMinutes(doc.closeTime) <= CLOSE_DEFER_MAX_MIN + FORCED_RETRY_MAX_MIN &&
    doc.lastAutoCloseDate !== today
  ) {
    try {
      // After the deferral window the day is closed regardless; unfiscalised sales then wait for admin approval.
      // An admin may already have closed it by hand: record that and stop trying.
      const status = await checkFiscalDayStatus(await resolveDeviceByKey(t.key));
      if (!status.isOpen) {
        await t.markClosed(today);
        messages.push(`Fiscal day was already closed (${today} ${hm} ${tz})`);
      } else {
        const overdue = toMinutes(hm) - toMinutes(doc.closeTime) >= CLOSE_DEFER_MAX_MIN;
        await closeFiscalDayWithReport("scheduled", { force: overdue, deviceKey: t.key });
        await t.markClosed(today);
        closed = true;
        messages.push(`Scheduled fiscal day close OK (${today} ${hm} ${tz})`);
      }
    } catch (e) {
      const waited = toMinutes(hm) - toMinutes(doc.closeTime);
      const detail = e instanceof Error ? e.message : String(e);
      if (e instanceof CloseInProgressError) {
        messages.push(`Scheduled close skipped: ${detail}`);
        return { closed, opened, messages };
      }
      if (e instanceof ReviewRequiredError) {
        // Not a device problem: someone must look at the refused receipts. Retrying only re-checks the count.
        messages.push(`Scheduled close held: ${detail}`);
        await sendFiscalAlertOnce(
          alertKey("close-needs-review", today),
          `${label} close is waiting for a review`,
          `The scheduled close${central ? "" : ` of "${t.name}"`} for ${today} has not run.

${detail}

Once the receipts are reviewed the close runs by itself within the minute.`
        );
        return { closed, opened, messages };
      }
      if (e instanceof FiscalCloseError) {
        const code = e.errorCode ?? "unknown reason";
        messages.push(`Scheduled close refused by ZIMRA (${code}): ${detail}`);
        await sendFiscalAlertOnce(
          alertKey(e.permanent ? `close-refused-permanent-${code}` : `close-refused-${code}`, today),
          e.permanent ? `${label} cannot be closed automatically (${code})` : `${label} close was refused (${code})`,
          `ZIMRA refused to close ${central ? "the fiscal day" : `the fiscal day on "${t.name}"`} for ${today}.

Reason: ${code}
${detail}

${
            e.permanent
              ? "A receipt with validation errors cannot be fixed by retrying. Selling can continue, but ZIMRA (portal or an officer) must close this day. Do not keep retrying."
              : "The system will try again. Check Admin > Fiscal Day if this repeats."
          }`
        );
        if (e.permanent) return { closed, opened, messages };
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
          alertKey("close-forced-failed", today),
          `${label} could not be closed`,
          `The scheduled close of ${central ? "the fiscal day" : `the fiscal day on "${t.name}"`} for ${today} was forced ${CLOSE_DEFER_MAX_MIN} minutes after ${doc.closeTime} and still failed.

Reason: ${detail}

The system keeps retrying for another ${FORCED_RETRY_MAX_MIN} minutes. If it does not close, check Admin > Fiscal Day (receipts waiting to upload) and close the day by hand.`
        );
      } else if (blocked && waited >= ALERT_AFTER_MIN) {
        await sendFiscalAlertOnce(
          alertKey("close-deferred", today),
          `${label} close is being held back`,
          `The scheduled close${central ? "" : ` of "${t.name}"`} for ${today} (${doc.closeTime}) has been held back for ${waited} minutes.

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
export async function openDayForWaitingSales(deviceKey: string, now = new Date()): Promise<boolean> {
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
  const now = new Date();

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
  if (!messages.length) messages.push("No schedule action for this minute");
  return { closed, opened, messages };
}
