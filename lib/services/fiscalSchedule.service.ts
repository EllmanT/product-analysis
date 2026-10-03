import { formatInTimeZone } from "date-fns-tz";

import {
  getFiscalSettingsDoc,
  setLastAutoCloseDate,
  setLastAutoOpenDate,
} from "@/lib/services/fiscalSettings.service";
import { checkFiscalDayStatus } from "@/lib/services/zimraFiscal.service";
import { closeFiscalDayWithReport, openFiscalDayOnly, PendingPosSalesError } from "@/lib/services/fiscalDayOps.service";

function timeMatches(stored: string, hm: string): boolean {
  return stored.trim() === hm;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.trim().split(":").map(Number);
  return h * 60 + m;
}

/** How long after the configured close time the day may stay open while POS sales are being fiscalised. */
const CLOSE_DEFER_MAX_MIN = 120;

function weekdayMatches(isoDow: number, weekdays: number[]): boolean {
  if (!weekdays.length) return false;
  return weekdays.includes(isoDow);
}

/**
 * Intended to be triggered every minute (e.g. cron + CRON_SECRET). Mirrors Laravel fiscal:process-schedules.
 */
export async function runFiscalScheduleTick(): Promise<{
  closed: boolean;
  opened: boolean;
  messages: string[];
}> {
  const messages: string[] = [];
  const doc = await getFiscalSettingsDoc();

  if (!doc.autoScheduleEnabled) {
    return { closed: false, opened: false, messages: ["Auto schedule is off"] };
  }

  const tz = doc.timezone?.trim() || "Africa/Harare";
  const now = new Date();
  const hm = formatInTimeZone(now, tz, "HH:mm");
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const isoDow = Number(formatInTimeZone(now, tz, "i"));

  const closeWeekdays =
    doc.closeWeekdays?.length ? doc.closeWeekdays : [1, 2, 3, 4, 5, 6, 7];
  const openWeekdays =
    doc.openWeekdays?.length ? doc.openWeekdays : [1, 2, 3, 4, 5, 6, 7];

  let closed = false;
  let opened = false;

  if (
    doc.autoCloseEnabled &&
    doc.closeTime &&
    weekdayMatches(isoDow, closeWeekdays) &&
    // At the close time, and on every later minute of the deferral window until it succeeds.
    toMinutes(hm) >= toMinutes(doc.closeTime) &&
    toMinutes(hm) - toMinutes(doc.closeTime) <= CLOSE_DEFER_MAX_MIN &&
    doc.lastAutoCloseDate !== today
  ) {
    try {
      // After the deferral window the day is closed regardless; unfiscalised sales then wait for admin approval.
      // An admin may already have closed it by hand: record that and stop trying.
      const status = await checkFiscalDayStatus();
      if (!status.isOpen) {
        await setLastAutoCloseDate(today);
        messages.push(`Fiscal day was already closed (${today} ${hm} ${tz})`);
      } else {
        const overdue = toMinutes(hm) - toMinutes(doc.closeTime) >= CLOSE_DEFER_MAX_MIN;
        await closeFiscalDayWithReport("scheduled", { force: overdue });
        await setLastAutoCloseDate(today);
        closed = true;
        messages.push(`Scheduled fiscal day close OK (${today} ${hm} ${tz})`);
      }
    } catch (e) {
      messages.push(
        e instanceof PendingPosSalesError
          ? `Scheduled close deferred: ${e.message} Retrying every minute for up to ${CLOSE_DEFER_MAX_MIN} minutes.`
          : `Scheduled close failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const docAfter = await getFiscalSettingsDoc();
  if (
    docAfter.autoOpenEnabled &&
    docAfter.openTime &&
    weekdayMatches(isoDow, openWeekdays) &&
    timeMatches(docAfter.openTime, hm) &&
    docAfter.lastAutoOpenDate !== today
  ) {
    try {
      await openFiscalDayOnly();
      await setLastAutoOpenDate(today);
      opened = true;
      messages.push(`Scheduled fiscal day open OK (${today} ${hm} ${tz})`);
    } catch (e) {
      messages.push(
        `Scheduled open failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (!closed && !opened && messages.length === 0) {
    messages.push("No schedule action for this minute");
  }

  return { closed, opened, messages };
}
