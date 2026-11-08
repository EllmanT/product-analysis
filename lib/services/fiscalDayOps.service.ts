import { randomUUID } from "node:crypto";

import FiscalCloseAttempt, { type CloseAttemptOutcome } from "@/database/fiscalCloseAttempt.model";
import PosSale from "@/database/posSale.model";
import ZReport, { type IZReportDoc } from "@/database/zReport.model";
import FiscalDevice from "@/database/fiscalDevice.model";
import { closeDay as serviceCloseDay, fiscalBackend, openDay as serviceOpenDay } from "@/lib/fiscal/client";
import dbConnect from "@/lib/mongoose";
import logger from "@/lib/logger";
import { acquireCloseLock, lowerFence, raiseFence, releaseCloseLock } from "@/lib/services/fiscalDayControl.service";
import { countUnsetAside, drainUnsentBeforeClose, getCloseUnsentPolicy, markSetAside } from "@/lib/services/fiscalCloseDrain.service";
import { sendFiscalAlertOnce } from "@/lib/services/fiscalAlerts.service";
import { CENTRAL_KEY, resolveDeviceByKey, resolveServiceDeviceId, saleDeviceFilter, type ResolvedDevice } from "@/lib/services/fiscalDevice.service";
import { runPosQueue, todayInTz } from "@/lib/services/posSale.service";
import { getDeviceUploadBacklog, getPosDeviceStatus } from "@/lib/services/zimraPosDevice.service";
import { closeFiscalDay, openFiscalDay } from "@/lib/services/zimraFiscal.service";
import { computeDayBreakdown } from "@/lib/services/zReportBreakdown.service";
import { closeErrorFromMessage, closeErrorIsPermanent, type CloseErrorCode } from "@/lib/zimraDayStatus";
import { extractZReportTotals } from "@/lib/zimraZReport";

/** Thrown when closing the day would strand POS sales that have no fiscal receipt yet. */
export class PendingPosSalesError extends Error {
  constructor(public readonly pending: number) {
    super(
      `${pending} POS sale${pending === 1 ? " is" : "s are"} not fiscalised yet. Closing the day now would leave ${
        pending === 1 ? "it" : "them"
      } without a fiscal receipt for today.`
    );
  }
}

/** The device still has signed receipts that ZIMRA has not received (or we cannot tell). Retry shortly. */
export class DeviceBacklogError extends PendingPosSalesError {
  constructor(pending: number, detail?: string) {
    super(pending);
    this.message = detail
      ? `Cannot confirm the fiscal device has uploaded every receipt to ZIMRA (${detail}). Closing now could fail.`
      : `The fiscal device has not yet uploaded ${pending} receipt${pending === 1 ? "" : "s"} to ZIMRA. It is catching up; closing now could fail.`;
  }
}

/** Another close for this device is already running (cron and a manual close can overlap). */
export class CloseInProgressError extends Error {
  constructor() {
    super("A fiscal day close is already running for this device. Wait for it to finish.");
  }
}

/** Receipts the device refused on validation grounds have not been looked at yet. */
export class ReviewRequiredError extends Error {
  constructor(public readonly count: number) {
    super(
      `${count} receipt${count === 1 ? " was" : "s were"} refused by the fiscal device and ${
        count === 1 ? "has" : "have"
      } not been reviewed. Review ${count === 1 ? "it" : "them"} (Admin > POS sales) before the day is closed.`
    );
  }
}

/** ZIMRA refused to close the day. `errorCode` is the device's reason when it reported one. */
export class FiscalCloseError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: CloseErrorCode,
    public readonly permanent = false
  ) {
    super(message);
  }
}

const BACKLOG_WAIT_MS = 25_000;
const BACKLOG_POLL_MS = 5_000;
const INFLIGHT_WAIT_MS = 30_000;
const CLOSE_INITIATED_WAIT_MS = 60_000;

/** Give the device a short chance to finish uploading before we ask ZIMRA to close the day. */
async function waitForDeviceUpload(device: ResolvedDevice): Promise<void> {
  const deadline = Date.now() + BACKLOG_WAIT_MS;
  for (;;) {
    const b = await getDeviceUploadBacklog(device);
    if (b.ok && b.pending === 0) return;
    if (Date.now() + BACKLOG_POLL_MS > deadline) throw b.ok ? new DeviceBacklogError(b.pending) : new DeviceBacklogError(0, b.message);
    await new Promise((r) => setTimeout(r, BACKLOG_POLL_MS));
  }
}

/** Wait for requests that were already on their way to the device when the fence went up. */
async function waitForInFlightSales(deviceKey: string): Promise<void> {
  const deadline = Date.now() + INFLIGHT_WAIT_MS;
  for (;;) {
    const n = await PosSale.countDocuments({ ...saleDeviceFilter(deviceKey), status: "SUBMITTING" });
    if (n === 0 || Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

/** A close already in progress on the device: wait for ZIMRA's answer instead of sending a second one. */
async function waitForCloseToSettle(device: ResolvedDevice): Promise<string> {
  const deadline = Date.now() + CLOSE_INITIATED_WAIT_MS;
  for (;;) {
    const st = await getPosDeviceStatus(device);
    if (st.reachable && st.dayStatus !== "FiscalDayCloseInitiated") return st.dayStatus;
    if (Date.now() >= deadline) return "FiscalDayCloseInitiated";
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

/**
 * Today's POS sales still waiting for a fiscal receipt (test sales excluded). With `deviceKey` only that
 * device's sales count, which is what closing its fiscal day needs; without it, every device.
 */
export async function countPendingPosSales(deviceKey?: string): Promise<number> {
  await dbConnect();
  return PosSale.countDocuments({
    ...(deviceKey ? saleDeviceFilter(deviceKey) : {}),
    soldDate: todayInTz(),
    isTest: { $ne: true },
    status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] },
  });
}

/** Receipts the device refused on validation grounds that nobody has reviewed yet. */
export async function countSalesNeedingReview(deviceKey?: string): Promise<number> {
  await dbConnect();
  return PosSale.countDocuments({
    ...(deviceKey ? saleDeviceFilter(deviceKey) : {}),
    needsReview: true,
    isTest: { $ne: true },
  });
}

async function recordAttempt(
  deviceKey: string,
  source: "manual" | "scheduled",
  forced: boolean,
  startedAt: Date,
  outcome: CloseAttemptOutcome,
  extra: { errorCode?: string; message?: string; fiscalDayNo?: number | null; pendingSales?: number; deviceStatusAfter?: string } = {}
): Promise<void> {
  try {
    await FiscalCloseAttempt.create({ deviceKey, source, forced, outcome, startedAt, finishedAt: new Date(), ...extra });
  } catch (e) {
    logger.error({ deviceKey, err: e instanceof Error ? e.message : String(e) }, "Could not record fiscal close attempt");
  }
}

/**
 * Get a device ready to close: every sale without a fiscal receipt is dealt with, then the fence goes up.
 *  - policy "send_first": waiting sales are sent one at a time first (see fiscalCloseDrain.service.ts). Sales that
 *    arrive while the fence is going up are sent in another pass, up to three passes.
 *  - policy "stop": the queue gets one ordinary run, and anything left refuses the close.
 * Returns how many sales were still waiting (only non-zero for a forced close). Throws PendingPosSalesError when
 * a normal close would strand sales.
 */
async function settleUnsentAndFence(
  deviceKey: string,
  owner: string,
  opts: { forced: boolean; sendFirst: boolean; runQueueAfterFence: boolean }
): Promise<number> {
  let pending = 0;
  for (let pass = 1; ; pass++) {
    await runPosQueue(25, { deviceKey }).catch(() => undefined);
    if (opts.sendFirst) await drainUnsentBeforeClose(deviceKey, owner);
    pending = await countPendingPosSales(deviceKey);
    if (!opts.forced && pending > 0) throw new PendingPosSalesError(pending);

    await raiseFence(deviceKey, owner);
    await waitForInFlightSales(deviceKey);
    if (opts.runQueueAfterFence) await runPosQueue(25, { deviceKey }).catch(() => undefined);
    pending = await countPendingPosSales(deviceKey);
    if (pending === 0 || opts.forced) return pending;
    if (!opts.sendFirst || pass >= 3) throw new PendingPosSalesError(pending);
    await lowerFence(deviceKey, owner); // a sale arrived while the fence went up: send it too
  }
}

/**
 * Refused receipts (a validation error ZIMRA will never accept) cannot be fixed by sending again. With "send first"
 * they are set aside for review instead of holding the day open. Returns how many were set aside.
 */
async function reviewGate(deviceKey: string, source: "manual" | "scheduled", forced: boolean, sendFirst: boolean): Promise<number> {
  if (sendFirst) return countUnsetAside(deviceKey);
  const review = await countSalesNeedingReview(deviceKey);
  if (review > 0 && (source === "scheduled" || !forced)) throw new ReviewRequiredError(review);
  return 0;
}

async function afterClosedSetAside(deviceKey: string, name: string, count: number): Promise<void> {
  if (count <= 0) return;
  await markSetAside(deviceKey).catch(() => undefined);
  await sendFiscalAlertOnce(
    `close-set-aside:${deviceKey}:${todayInTz()}`,
    `${count} receipt${count === 1 ? " was" : "s were"} set aside when the day closed`,
    `The fiscal day on "${name}" closed on schedule. ${count} receipt${count === 1 ? " was" : "s were"} refused by the fiscal device and could not be sent, so ${
      count === 1 ? "it was" : "they were"
    } set aside and ${count === 1 ? "is" : "are"} not in today's figures.

Sending them again cannot fix this. Open Admin > POS sales, look at the refused receipt${count === 1 ? "" : "s"}, and issue ${count === 1 ? "it" : "them"} again with the right details.`
  ).catch(() => undefined);
}

/**
 * FISCAL_BACKEND=service: close the day through the fiscal service. Same guards as the legacy close (one close at a
 * time, reviewed refusals, the app's own queue drained, a fence while it runs), but the device-level work (drain
 * what the service still holds, check the counters against ZIMRA, recover from close errors) is the service's.
 */
async function closeViaService(source: "manual" | "scheduled", opts: { force?: boolean; deviceKey?: string }): Promise<IZReportDoc> {
  const deviceKey = opts.deviceKey || CENTRAL_KEY;
  const forced = !!opts.force;
  const serviceDeviceId = await resolveServiceDeviceId(deviceKey);
  const owner = randomUUID();
  if (!(await acquireCloseLock(deviceKey, owner))) throw new CloseInProgressError();

  const startedAt = new Date();
  let pendingSeen = 0;
  try {
    const sendFirst = (await getCloseUnsentPolicy(deviceKey)) === "send_first";
    const setAside = await reviewGate(deviceKey, source, forced, sendFirst);

    // Send and collect everything the app still holds while tills keep selling, then hold new receipts back.
    pendingSeen = await settleUnsentAndFence(deviceKey, owner, { forced, sendFirst, runQueueAfterFence: true });

    let res: Awaited<ReturnType<typeof serviceCloseDay>>;
    try {
      res = await serviceCloseDay(serviceDeviceId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await recordAttempt(deviceKey, source, forced, startedAt, "failed", { message: message.slice(0, 500), pendingSales: pendingSeen });
      throw new FiscalCloseError(`Could not reach the fiscal service: ${message}`);
    }
    const data = (res.data ?? {}) as { ok?: boolean; fiscalDayNo?: number; totals?: Record<string, { sales: string }>; reason?: string; message?: string; errorCode?: string; permanent?: boolean };
    if (!res.success || !data.ok) {
      const message = data.message || res.message || "The fiscal service could not close the day";
      await recordAttempt(deviceKey, source, forced, startedAt, "failed", { errorCode: data.errorCode, message: message.slice(0, 500), pendingSales: pendingSeen });
      throw new FiscalCloseError(message, data.errorCode as CloseErrorCode | undefined, !!data.permanent);
    }

    const num = (c: string) => (data.totals?.[c]?.sales != null ? Number(data.totals[c]!.sales) : null);
    await recordAttempt(deviceKey, source, forced, startedAt, "closed", { fiscalDayNo: data.fiscalDayNo ?? null, pendingSales: pendingSeen });
    const name = deviceKey === CENTRAL_KEY ? "Central device" : ((await FiscalDevice.findById(deviceKey).select("name deviceId").lean<{ name: string; deviceId?: string }>()) ?? { name: deviceKey }).name;
    return ZReport.create({
      source,
      closedAt: new Date(),
      fiscalDeviceKey: deviceKey,
      deviceName: name,
      fiscalDayNo: data.fiscalDayNo ?? null,
      totalSalesUsd: num("USD"),
      totalSalesZwg: num("ZWG"),
      breakdown: await computeDayBreakdown(deviceKey, data.fiscalDayNo ?? null),
      setAsideCount: setAside,
      rawCloseResponse: { source: "fiscal-service", ...data },
    }).then(async (z: IZReportDoc) => {
      await afterClosedSetAside(deviceKey, name, setAside);
      return z;
    });
  } finally {
    await releaseCloseLock(deviceKey, owner).catch(() => undefined);
  }
}

/**
 * Close one device's fiscal day and keep the Z-report (the central device unless `deviceKey` is given).
 *
 * A device has one day shared by all the branches that use it, so the close is guarded:
 *  1. one close at a time per device (a lock shared by every app instance);
 *  2. receipts the device refused and nobody reviewed block the close (scheduled closes always);
 *  3. the device's queue is drained and UNKNOWN sales are reconciled first;
 *  4. a fence then holds new receipts back, in-flight ones finish, and the count is taken again;
 *  5. a close already in progress on the device is waited for, never sent twice;
 *  6. every attempt is recorded with the device's reason when ZIMRA refuses.
 * `force` still reconciles and fences, but does not insist on an empty queue.
 */
export async function closeFiscalDayWithReport(
  source: "manual" | "scheduled",
  opts: { force?: boolean; deviceKey?: string } = {}
): Promise<IZReportDoc> {
  if (fiscalBackend() === "service") return closeViaService(source, opts);
  const deviceKey = opts.deviceKey || CENTRAL_KEY;
  const forced = !!opts.force;
  const device = await resolveDeviceByKey(deviceKey);
  const owner = randomUUID();
  if (!(await acquireCloseLock(deviceKey, owner))) throw new CloseInProgressError();

  const startedAt = new Date();
  let pendingSeen = 0;
  try {
    const sendFirst = (await getCloseUnsentPolicy(deviceKey)) === "send_first";
    const setAside = await reviewGate(deviceKey, source, forced, sendFirst);

    // Read the device first: a Red receipt cannot be retried away, and a close in progress must not be repeated.
    const before = await getPosDeviceStatus(device);
    if (
      before.reachable &&
      before.dayStatus === "FiscalDayCloseFailed" &&
      closeErrorIsPermanent(before.closingErrorCode) &&
      source === "scheduled"
    ) {
      throw new FiscalCloseError(
        `The device reports ${before.closingErrorCode}. Retrying cannot fix this; ZIMRA must close the day.`,
        before.closingErrorCode,
        true
      );
    }
    if (before.reachable && before.dayStatus === "FiscalDayCloseInitiated") {
      const after = await waitForCloseToSettle(device);
      if (after === "FiscalDayClosed") {
        await recordAttempt(deviceKey, source, forced, startedAt, "closed", {
          fiscalDayNo: before.fiscalDayNo,
          message: "Close was already in progress and completed",
        });
        return ZReport.create({
          source,
          closedAt: new Date(),
          fiscalDeviceKey: deviceKey,
          deviceName: device.name,
          deviceId: device.deviceId,
          fiscalDayNo: before.fiscalDayNo,
          breakdown: await computeDayBreakdown(deviceKey, before.fiscalDayNo),
          totalSalesUsd: null,
          totalSalesZwg: null,
          rawCloseResponse: { note: "Closed by an earlier request that was still in progress" },
        });
      }
      throw new FiscalCloseError(`The device is still processing an earlier close (${after}). It will not be sent again.`);
    }

    // Drain the queue and reconcile UNKNOWN sales while tills are still selling normally, then hold new receipts
    // back for the few seconds the close needs.
    pendingSeen = await settleUnsentAndFence(deviceKey, owner, { forced, sendFirst, runQueueAfterFence: false });
    if (!forced) {
      await waitForDeviceUpload(device);
    } else {
      // A forced close still gives the device a chance to finish uploading first, but never blocks on it.
      await waitForDeviceUpload(device).catch(() => undefined);
    }

    let raw: Record<string, unknown>;
    try {
      raw = await closeFiscalDay(device);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const st = await getPosDeviceStatus(device);
      const code = st.closingErrorCode ?? closeErrorFromMessage(message);
      await recordAttempt(deviceKey, source, forced, startedAt, "failed", {
        errorCode: code,
        message: message.slice(0, 500),
        fiscalDayNo: st.fiscalDayNo,
        pendingSales: pendingSeen,
        deviceStatusAfter: st.dayStatus,
      });
      throw new FiscalCloseError(message, code, closeErrorIsPermanent(code));
    }

    const t = extractZReportTotals(raw);
    await recordAttempt(deviceKey, source, forced, startedAt, "closed", { fiscalDayNo: t.fiscalDayNo, pendingSales: pendingSeen });
    return ZReport.create({
      source,
      closedAt: new Date(),
      fiscalDeviceKey: deviceKey,
      deviceName: device.name,
      deviceId: device.deviceId,
      fiscalDayNo: t.fiscalDayNo,
      totalSalesUsd: t.usd,
      totalSalesZwg: t.zwg,
      breakdown: await computeDayBreakdown(deviceKey, t.fiscalDayNo),
      setAsideCount: setAside,
      rawCloseResponse: raw,
    }).then(async (z: IZReportDoc) => {
      await afterClosedSetAside(deviceKey, device.name, setAside);
      return z;
    });
  } finally {
    await releaseCloseLock(deviceKey, owner).catch(() => undefined);
  }
}

export async function openFiscalDayOnly(deviceKey?: string): Promise<void> {
  if (fiscalBackend() === "service") {
    const r = await serviceOpenDay(await resolveServiceDeviceId(deviceKey));
    if (!r.success) throw new Error(r.message || "The fiscal service could not open the day");
    return;
  }
  await openFiscalDay(await resolveDeviceByKey(deviceKey));
}
