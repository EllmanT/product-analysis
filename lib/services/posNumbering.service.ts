import type { Types } from "mongoose";

import InvoiceCounter from "@/database/invoiceCounter.model";

export type PosSeries = "USD" | "ZWG" | "USD-P" | "ZWG-P" | "USD-C" | "ZWG-C";

export function seriesFor(currency: "USD" | "ZWG", provisional: boolean, credit = false): PosSeries {
  if (credit) return `${currency}-C` as PosSeries;
  return (provisional ? `${currency}-P` : currency) as PosSeries;
}

/** HUC0001 / HZC0001: fiscal credit notes have their own series so the invoice series stays gapless. */
export function formatCreditNumber(prefix: string, currency: "USD" | "ZWG", n: number): string {
  return `${prefix}${currency === "USD" ? "U" : "Z"}C${String(n).padStart(4, "0")}`;
}

/** HU0001 (fiscal USD), HZ0001 (fiscal ZWG), HUP0001 / HZP0001 (provisional slips). */
export function formatInvoiceNumber(
  prefix: string,
  currency: "USD" | "ZWG",
  n: number,
  provisional: boolean
): string {
  const letter = currency === "USD" ? "U" : "Z";
  return `${prefix}${letter}${provisional ? "P" : ""}${String(n).padStart(4, "0")}`;
}

function isDuplicateKey(e: unknown): boolean {
  return (e as { code?: number } | null)?.code === 11000;
}

/**
 * Atomically take the next number for a (branch, series).
 * Numbers released after a definitive device rejection are reused first (smallest first),
 * so the fiscal series stays gapless. Safe under concurrent callers.
 */
export async function allocateNumber(
  branchId: Types.ObjectId | string,
  series: PosSeries
): Promise<number> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const doc = await InvoiceCounter.findOne({ branchId, series }).select("free").lean<{ free?: number[] }>();
    const free = doc?.free ?? [];
    if (free.length > 0) {
      const min = Math.min(...free);
      const r = await InvoiceCounter.updateOne({ branchId, series, free: min }, { $pull: { free: min } });
      if (r.modifiedCount === 1) return min;
      continue; // someone else took it, look again
    }
    try {
      const next = await InvoiceCounter.findOneAndUpdate(
        { branchId, series },
        { $inc: { seq: 1 }, $setOnInsert: { free: [] } },
        { new: true, upsert: true }
      ).lean<{ seq: number }>();
      if (next) return next.seq;
    } catch (e) {
      if (isDuplicateKey(e)) continue; // two first-ever allocations raced on the upsert
      throw e;
    }
  }
  throw new Error("Could not allocate an invoice number (too much contention)");
}

/** Give back a number that was allocated but definitely never recorded by the device. */
export async function releaseNumber(
  branchId: Types.ObjectId | string,
  series: PosSeries,
  n: number
): Promise<void> {
  await InvoiceCounter.updateOne({ branchId, series }, { $addToSet: { free: n } });
}

/** Extract the numeric part of a number we formatted (HU0042 -> 42). */
export function parseSequence(invoiceNumber: string): number | null {
  const m = invoiceNumber.match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}
