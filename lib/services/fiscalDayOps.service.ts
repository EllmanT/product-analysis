import PosSale from "@/database/posSale.model";
import ZReport, { type IZReportDoc } from "@/database/zReport.model";
import dbConnect from "@/lib/mongoose";
import { runPosQueue, todayInTz } from "@/lib/services/posSale.service";
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

/** Today's POS sales still waiting for a fiscal receipt (test sales excluded). */
export async function countPendingPosSales(): Promise<number> {
  await dbConnect();
  return PosSale.countDocuments({
    soldDate: todayInTz(),
    isTest: { $ne: true },
    status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] },
  });
}

/**
 * Close the fiscal day and keep the Z-report.
 * The device has one day for every branch, so before closing we give the retry queue one more
 * chance, and refuse if POS sales from today are still unfiscalised (unless `force`).
 */
export async function closeFiscalDayWithReport(
  source: "manual" | "scheduled",
  opts: { force?: boolean } = {}
): Promise<IZReportDoc> {
  if (!opts.force) {
    await runPosQueue().catch(() => undefined);
    const pending = await countPendingPosSales();
    if (pending > 0) throw new PendingPosSalesError(pending);
  }
  const raw = await closeFiscalDay();
  const t = extractZReportTotals(raw);
  return ZReport.create({
    source,
    closedAt: new Date(),
    fiscalDayNo: t.fiscalDayNo,
    totalSalesUsd: t.usd,
    totalSalesZwg: t.zwg,
    rawCloseResponse: raw,
  });
}

export async function openFiscalDayOnly(): Promise<void> {
  await openFiscalDay();
}
