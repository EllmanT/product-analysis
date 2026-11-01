import FiscalDayControl from "@/database/fiscalDayControl.model";
import dbConnect from "@/lib/mongoose";

/** A crashed close must not freeze selling or closing for long. */
const LOCK_TTL_MS = 5 * 60_000;
const FENCE_TTL_MS = 3 * 60_000;

async function ensureRow(deviceKey: string): Promise<void> {
  try {
    await FiscalDayControl.updateOne({ deviceKey }, { $setOnInsert: { deviceKey } }, { upsert: true });
  } catch (e) {
    // Two instances creating the row at once: the loser gets a duplicate key error, and the row exists.
    if ((e as { code?: number }).code !== 11000) throw e;
  }
}

/** Take the per-device close lock. Returns false when another close (cron or manual, any instance) holds it. */
export async function acquireCloseLock(deviceKey: string, owner: string): Promise<boolean> {
  await dbConnect();
  await ensureRow(deviceKey);
  const now = new Date();
  const got = await FiscalDayControl.findOneAndUpdate(
    {
      deviceKey,
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: now } }, { lockOwner: owner }],
    },
    { $set: { lockOwner: owner, lockedUntil: new Date(now.getTime() + LOCK_TTL_MS) } },
    { new: true }
  );
  return !!got;
}

export async function releaseCloseLock(deviceKey: string, owner: string): Promise<void> {
  await dbConnect();
  await FiscalDayControl.updateOne(
    { deviceKey, lockOwner: owner },
    { $unset: { lockOwner: "", lockedUntil: "", fenceUntil: "" } }
  );
}

/** While fenced, new receipts for this device queue instead of being sent (a close is about to run). */
export async function raiseFence(deviceKey: string, owner: string): Promise<void> {
  await dbConnect();
  await FiscalDayControl.updateOne(
    { deviceKey, lockOwner: owner },
    { $set: { fenceUntil: new Date(Date.now() + FENCE_TTL_MS) } }
  );
}

export async function isFenced(deviceKey: string): Promise<boolean> {
  await dbConnect();
  const row = await FiscalDayControl.findOne({ deviceKey, fenceUntil: { $gt: new Date() } })
    .select("_id")
    .lean();
  return !!row;
}
