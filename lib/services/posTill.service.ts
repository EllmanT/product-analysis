import { Types } from "mongoose";

import PosSale from "@/database/posSale.model";
import Till, { type ITill } from "@/database/till.model";
import dbConnect from "@/lib/mongoose";

export interface TillDto {
  id: string;
  branchId: string;
  code: string;
  name: string;
  enabled: boolean;
}

export class TillError extends Error {
  constructor(
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}

const MAX_TILLS = 50;

function toDto(t: ITill & { _id: unknown }): TillDto {
  return { id: String(t._id), branchId: String(t.branchId), code: t.code, name: t.name, enabled: t.enabled };
}

const codeNo = (code: string) => Number(/^T(\d+)$/.exec(code)?.[1] ?? 0);

export async function listTills(branchId: string, opts: { includeDisabled?: boolean } = {}): Promise<TillDto[]> {
  await dbConnect();
  const rows = await Till.find({ branchId: new Types.ObjectId(branchId), ...(opts.includeDisabled ? {} : { enabled: true }) }).lean<
    (ITill & { _id: unknown })[]
  >();
  return rows.map(toDto).sort((a, b) => codeNo(a.code) - codeNo(b.code) || a.code.localeCompare(b.code));
}

/**
 * Make exactly `count` tills available in the branch: switched-off ones are re-used first, missing ones
 * are created ("Till 1", "Till 2", ...), and any beyond `count` are switched off. Nothing is ever deleted.
 */
export async function setTillCount(branchId: string, count: number): Promise<TillDto[]> {
  if (!Number.isInteger(count) || count < 0 || count > MAX_TILLS) {
    throw new TillError(`Number of tills must be between 0 and ${MAX_TILLS}`, 400);
  }
  await dbConnect();
  const bid = new Types.ObjectId(branchId);
  const all = await listTills(branchId, { includeDisabled: true });
  let next = all.reduce((m, t) => Math.max(m, codeNo(t.code)), 0);
  const enabledNow = all.filter((t) => t.enabled).length;

  if (enabledNow < count) {
    let need = count - enabledNow;
    for (const t of all.filter((x) => !x.enabled)) {
      if (need === 0) break;
      await Till.updateOne({ _id: t.id }, { $set: { enabled: true } });
      need--;
    }
    while (need > 0) {
      next++;
      await Till.create({ branchId: bid, code: `T${next}`, name: `Till ${next}`, enabled: true });
      need--;
    }
  } else if (enabledNow > count) {
    // Switch off the highest-numbered enabled tills.
    const enabled = all.filter((t) => t.enabled).reverse();
    for (const t of enabled.slice(0, enabledNow - count)) {
      await Till.updateOne({ _id: t.id }, { $set: { enabled: false } });
    }
  }
  return listTills(branchId, { includeDisabled: true });
}

export async function updateTill(tillId: string, patch: { name?: string; enabled?: boolean }): Promise<TillDto> {
  await dbConnect();
  const $set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new TillError("Till name cannot be empty", 400);
    $set.name = name.slice(0, 60);
  }
  if (patch.enabled !== undefined) $set.enabled = patch.enabled;
  if (!Object.keys($set).length) throw new TillError("Nothing to change", 400);
  const t = await Till.findByIdAndUpdate(tillId, { $set }, { new: true }).lean<(ITill & { _id: unknown }) | null>();
  if (!t) throw new TillError("Till not found", 404);
  return toDto(t);
}

/** Check a till id sent with a sale: it must belong to the branch. Disabled tills still count (offline sales sync late). */
export async function resolveSaleTill(
  branchId: string,
  tillId: string | undefined
): Promise<{ tillId: Types.ObjectId; tillCode: string } | null> {
  if (!tillId) return null;
  if (!Types.ObjectId.isValid(tillId)) throw new TillError("Invalid till", 400);
  await dbConnect();
  const t = await Till.findById(tillId).lean<(ITill & { _id: Types.ObjectId }) | null>();
  if (!t || String(t.branchId) !== branchId) throw new TillError("That till does not belong to this branch", 400);
  return { tillId: t._id, tillCode: t.code };
}

export interface TillReportRow {
  tillId: string | null;
  code: string;
  name: string;
  currency: string;
  sales: number;
  total: number;
  pending: number;
}

/** Fiscalised and still-pending sales per till and currency for a date range (inclusive, YYYY-MM-DD). */
export async function tillReport(branchId: string, from: string, to: string): Promise<TillReportRow[]> {
  await dbConnect();
  const tills = await listTills(branchId, { includeDisabled: true });
  const byId = new Map(tills.map((t) => [t.id, t]));
  const rows = await PosSale.aggregate<{ _id: { till: Types.ObjectId | null; currency: string }; sales: number; total: number; pending: number }>([
    {
      $match: {
        branchId: new Types.ObjectId(branchId),
        soldDate: { $gte: from, $lte: to },
        isTest: { $ne: true },
        status: { $in: ["FISCALISED", "PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] },
      },
    },
    {
      $group: {
        _id: { till: { $ifNull: ["$tillId", null] }, currency: "$currency" },
        sales: { $sum: { $cond: [{ $eq: ["$status", "FISCALISED"] }, 1, 0] } },
        total: { $sum: { $cond: [{ $eq: ["$status", "FISCALISED"] }, "$totalAmount", 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "FISCALISED"] }, 0, 1] } },
      },
    },
  ]);
  return rows
    .map((r) => {
      const t = r._id.till ? byId.get(String(r._id.till)) : undefined;
      return {
        tillId: r._id.till ? String(r._id.till) : null,
        code: t?.code ?? (r._id.till ? "?" : "-"),
        name: t?.name ?? (r._id.till ? "Unknown till" : "No till recorded"),
        currency: r._id.currency,
        sales: r.sales,
        total: Math.round(r.total * 100) / 100,
        pending: r.pending,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code) || a.currency.localeCompare(b.currency));
}
