import PosSale from "@/database/posSale.model";
import ZReport, { type IZReportDoc } from "@/database/zReport.model";
import dbConnect from "@/lib/mongoose";
import { CENTRAL_KEY, resolveDeviceByKey, saleDeviceFilter, type ResolvedDevice } from "@/lib/services/fiscalDevice.service";
import { runPosQueue, todayInTz } from "@/lib/services/posSale.service";
import { getDeviceUploadBacklog } from "@/lib/services/zimraPosDevice.service";
import { closeFiscalDay, openFiscalDay } from "@/lib/services/zimraFiscal.service";
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

const BACKLOG_WAIT_MS = 25_000;
const BACKLOG_POLL_MS = 5_000;

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

/**
 * Close one device's fiscal day and keep the Z-report (the central device unless `deviceKey` is given).
 * A device has one day shared by all the branches that use it, so before closing we give that
 * device's retry queue one more chance, and refuse if its POS sales from today are still
 * unfiscalised (unless `force`). Other devices are not looked at.
 */
export async function closeFiscalDayWithReport(
  source: "manual" | "scheduled",
  opts: { force?: boolean; deviceKey?: string } = {}
): Promise<IZReportDoc> {
  const deviceKey = opts.deviceKey || CENTRAL_KEY;
  const device = await resolveDeviceByKey(deviceKey);
  if (!opts.force) {
    await runPosQueue(25, { deviceKey }).catch(() => undefined);
    const pending = await countPendingPosSales(deviceKey);
    if (pending > 0) throw new PendingPosSalesError(pending);
    await waitForDeviceUpload(device);
  } else {
    // A forced close still gives the device a chance to finish uploading first, but never blocks on it.
    await waitForDeviceUpload(device).catch(() => undefined);
  }
  const raw = await closeFiscalDay(device);
  const t = extractZReportTotals(raw);
  return ZReport.create({
    source,
    closedAt: new Date(),
    fiscalDeviceKey: deviceKey,
    deviceName: device.name,
    deviceId: device.deviceId,
    fiscalDayNo: t.fiscalDayNo,
    totalSalesUsd: t.usd,
    totalSalesZwg: t.zwg,
    rawCloseResponse: raw,
  });
}

export async function openFiscalDayOnly(deviceKey?: string): Promise<void> {
  await openFiscalDay(await resolveDeviceByKey(deviceKey));
}
