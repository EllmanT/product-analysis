import { Types } from "mongoose";

import Branch from "@/database/branch.model";
import PosSale from "@/database/posSale.model";
import dbConnect from "@/lib/mongoose";

export type Cur = "USD" | "ZWG";

export interface CurrencyFigures {
  fiscalised: { count: number; total: number; vat: number };
  /** Fiscal credit notes: negative amounts, kept apart so "fiscalised" stays the sales figure. */
  credit: { count: number; total: number; vat: number };
  pending: { count: number; total: number };
  failed: number;
  voided: number;
}

const blank = (): CurrencyFigures => ({
  fiscalised: { count: 0, total: 0, vat: 0 },
  credit: { count: 0, total: 0, vat: 0 },
  pending: { count: 0, total: 0 },
  failed: 0,
  voided: 0,
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const PENDING = ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"];

export interface PosAnalytics {
  range: { from: string; to: string };
  totals: Record<Cur, CurrencyFigures>;
  branches: { branchId: string; name: string; prefix: string; USD: CurrencyFigures; ZWG: CurrencyFigures }[];
  days: { date: string; USD: { count: number; total: number }; ZWG: { count: number; total: number } }[];
  attention: { unfiscalised: number; needsApproval: number; failed: number; offlinePending: number };
}

function addInto(f: CurrencyFigures, status: string, count: number, total: number, vat: number, credit: boolean) {
  if (status === "FISCALISED" && credit) {
    f.credit.count += count;
    f.credit.total = round2(f.credit.total + total);
    f.credit.vat = round2(f.credit.vat + vat);
  } else if (status === "FISCALISED") {
    f.fiscalised.count += count;
    f.fiscalised.total = round2(f.fiscalised.total + total);
    f.fiscalised.vat = round2(f.fiscalised.vat + vat);
  } else if (PENDING.includes(status)) {
    f.pending.count += count;
    f.pending.total = round2(f.pending.total + total);
  } else if (status === "FAILED") f.failed += count;
  else if (status === "VOIDED") f.voided += count;
}

/**
 * Sales figures for a date range (Harare dates, inclusive), per currency, per branch and per day.
 * `branchId` limits everything to one branch; callers pass the caller's own branch for non-admins.
 */
export async function getPosAnalytics(opts: {
  from: string;
  to: string;
  branchId?: string;
  includeTest?: boolean;
}): Promise<PosAnalytics> {
  await dbConnect();
  const match: Record<string, unknown> = { soldDate: { $gte: opts.from, $lte: opts.to } };
  if (opts.branchId) match.branchId = new Types.ObjectId(opts.branchId);
  if (!opts.includeTest) match.isTest = { $ne: true };

  const [byBranch, byDay, attentionRows, branchDocs] = await Promise.all([
    PosSale.aggregate<{ _id: { b: Types.ObjectId; c: Cur; s: string; k: boolean }; n: number; t: number; v: number }>([
      { $match: match },
      {
        $group: {
          _id: { b: "$branchId", c: "$currency", s: "$status", k: { $eq: ["$kind", "CREDIT_NOTE"] } },
          n: { $sum: 1 },
          t: { $sum: "$totalAmount" },
          v: { $sum: "$totalVat" },
        },
      },
    ]),
    // By day: net of credit notes (they carry negative totals); the count is sales only.
    PosSale.aggregate<{ _id: { d: string; c: Cur }; n: number; t: number }>([
      { $match: { ...match, status: "FISCALISED" } },
      {
        $group: {
          _id: { d: "$soldDate", c: "$currency" },
          n: { $sum: { $cond: [{ $eq: ["$kind", "CREDIT_NOTE"] }, 0, 1] } },
          t: { $sum: "$totalAmount" },
        },
      },
    ]),
    // Attention items ignore the date range: anything still open matters whenever it was sold.
    PosSale.aggregate<{ _id: string; n: number }>([
      {
        $match: {
          ...(opts.branchId ? { branchId: new Types.ObjectId(opts.branchId) } : {}),
          ...(opts.includeTest ? {} : { isTest: { $ne: true } }),
          $or: [{ status: { $in: ["UNFISCALISED", "UNKNOWN", "FAILED"] } }, { needsApproval: true }],
        },
      },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$needsApproval", true] }, "approval", "$status"] },
          n: { $sum: 1 },
        },
      },
    ]),
    Branch.find(opts.branchId ? { _id: opts.branchId } : {}).select("name pos.invoicePrefix").lean<
      { _id: Types.ObjectId; name: string; pos?: { invoicePrefix?: string } }[]
    >(),
  ]);

  const totals: Record<Cur, CurrencyFigures> = { USD: blank(), ZWG: blank() };
  const branchMap = new Map<string, { USD: CurrencyFigures; ZWG: CurrencyFigures }>();
  for (const r of byBranch) {
    const id = String(r._id.b);
    const row = branchMap.get(id) ?? { USD: blank(), ZWG: blank() };
    addInto(row[r._id.c], r._id.s, r.n, r.t, r.v, r._id.k);
    addInto(totals[r._id.c], r._id.s, r.n, r.t, r.v, r._id.k);
    branchMap.set(id, row);
  }

  const names = new Map(branchDocs.map((b) => [String(b._id), b]));
  const branches = [...branchMap.entries()]
    .map(([id, figs]) => ({
      branchId: id,
      name: names.get(id)?.name ?? "Unknown branch",
      prefix: names.get(id)?.pos?.invoicePrefix ?? "",
      ...figs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const dayMap = new Map<string, PosAnalytics["days"][number]>();
  for (const r of byDay) {
    const row = dayMap.get(r._id.d) ?? { date: r._id.d, USD: { count: 0, total: 0 }, ZWG: { count: 0, total: 0 } };
    row[r._id.c] = { count: r.n, total: round2(r.t) };
    dayMap.set(r._id.d, row);
  }

  const att = Object.fromEntries(attentionRows.map((r) => [r._id, r.n]));
  const offlinePending = await PosSale.countDocuments({
    offline: true,
    status: { $in: ["UNFISCALISED", "UNKNOWN"] },
    ...(opts.branchId ? { branchId: new Types.ObjectId(opts.branchId) } : {}),
    ...(opts.includeTest ? {} : { isTest: { $ne: true } }),
  });

  return {
    range: { from: opts.from, to: opts.to },
    totals,
    branches,
    days: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    attention: {
      unfiscalised: (att.UNFISCALISED ?? 0) + (att.UNKNOWN ?? 0),
      needsApproval: att.approval ?? 0,
      failed: att.FAILED ?? 0,
      offlinePending,
    },
  };
}
