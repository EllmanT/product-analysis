import { Types } from "mongoose";

import FiscalDevice from "@/database/fiscalDevice.model";
import PosSale from "@/database/posSale.model";
import dbConnect from "@/lib/mongoose";
import logger from "@/lib/logger";
import { runDrain, type DrainResult } from "@/lib/closeDrain";
import { extendCloseLock, setDrainProgress } from "@/lib/services/fiscalDayControl.service";
import { CENTRAL_KEY, saleDeviceFilter } from "@/lib/services/fiscalDevice.service";
import { fiscalisePosSale } from "@/lib/services/posSale.service";
import { getFiscalSettingsDoc } from "@/lib/services/fiscalSettings.service";

export type CloseUnsentPolicy = "send_first" | "stop";

/** Sales that still have no fiscal receipt and may be sent again. FAILED (refused) is not among them. */
export const UNSENT_STATES = ["PENDING", "UNFISCALISED", "UNKNOWN"] as const;

/** What closing a device's day does about sales that have no fiscal receipt. Missing or unreadable means send_first. */
export async function getCloseUnsentPolicy(deviceKey: string): Promise<CloseUnsentPolicy> {
  try {
    await dbConnect();
    if (!deviceKey || deviceKey === CENTRAL_KEY || !Types.ObjectId.isValid(deviceKey)) {
      return (await getFiscalSettingsDoc()).closeUnsentPolicy === "stop" ? "stop" : "send_first";
    }
    const d = await FiscalDevice.findById(deviceKey).select("closeUnsentPolicy").lean<{ closeUnsentPolicy?: string }>();
    return d?.closeUnsentPolicy === "stop" ? "stop" : "send_first";
  } catch {
    return "send_first";
  }
}

/**
 * Before a day is closed: send every sale of this device that has no fiscal receipt, one at a time, keeping the close
 * lock alive and publishing progress for the Fiscal day page. Never throws.
 */
export async function drainUnsentBeforeClose(deviceKey: string, owner: string): Promise<DrainResult> {
  try {
    await dbConnect();
    // Sales held for an earlier-day approval are released: they go into the day that is open now.
    await PosSale.updateMany({ ...saleDeviceFilter(deviceKey), status: { $in: [...UNSENT_STATES] }, needsApproval: true }, { $set: { needsApproval: false } });
    return await runDrain({
      listWaiting: async () => {
        const rows = await PosSale.find({ ...saleDeviceFilter(deviceKey), status: { $in: [...UNSENT_STATES] }, isTest: { $ne: true } })
          .sort({ soldAt: 1 })
          .limit(200)
          .select("_id")
          .lean<{ _id: Types.ObjectId }[]>();
        return rows.map((r) => ({ id: String(r._id) }));
      },
      fiscaliseOne: async (id) => {
        await extendCloseLock(deviceKey, owner).catch(() => undefined);
        try {
          return (await fiscalisePosSale(id, { reason: "close-drain", force: true })).status;
        } catch (e) {
          logger.warn({ saleId: id, err: e instanceof Error ? e.message : String(e) }, "Close drain: sale not sent");
          return "UNFISCALISED";
        }
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      onProgress: (sent, total) => setDrainProgress(deviceKey, owner, sent, total).catch(() => undefined),
    });
  } catch (e) {
    logger.error({ deviceKey, err: e instanceof Error ? e.message : String(e) }, "Close drain failed");
    return { sent: 0, remaining: -1, gaveUp: "device" };
  }
}

/** Refused receipts the close sets aside: needs review, not yet set aside. */
export async function countUnsetAside(deviceKey: string): Promise<number> {
  await dbConnect();
  return PosSale.countDocuments({ ...saleDeviceFilter(deviceKey), needsReview: true, setAsideAt: { $exists: false }, isTest: { $ne: true } });
}

export async function markSetAside(deviceKey: string): Promise<void> {
  await dbConnect();
  await PosSale.updateMany(
    { ...saleDeviceFilter(deviceKey), needsReview: true, setAsideAt: { $exists: false }, isTest: { $ne: true } },
    { $set: { setAsideAt: new Date() } }
  );
}
