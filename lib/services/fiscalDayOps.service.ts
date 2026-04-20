import ZReport, { type IZReportDoc } from "@/database/zReport.model";
import { closeFiscalDay, openFiscalDay } from "@/lib/services/zimraFiscal.service";
import { extractZReportTotals } from "@/lib/zimraZReport";

export async function closeFiscalDayWithReport(
  source: "manual" | "scheduled"
): Promise<IZReportDoc> {
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
