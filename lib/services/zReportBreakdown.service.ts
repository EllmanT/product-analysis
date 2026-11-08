import PosSale from "@/database/posSale.model";
import dbConnect from "@/lib/mongoose";
import logger from "@/lib/logger";
import { saleDeviceFilter } from "@/lib/services/fiscalDevice.service";
import { buildBreakdown, type BreakdownSale, type ZReportBreakdown } from "@/lib/zReportBreakdown";

/**
 * The breakdown for one fiscal day of one device, from the receipts that ended up in that day.
 * Returns null when the day number is unknown, so a report is never printed with someone else's figures.
 * Never throws: a failure here must not stop a day from closing.
 */
export async function computeDayBreakdown(
  deviceKey: string,
  fiscalDayNo: number | null | undefined,
  basis: ZReportBreakdown["basis"] = "close"
): Promise<ZReportBreakdown | null> {
  if (fiscalDayNo == null) return null;
  try {
    await dbConnect();
    const sales = await PosSale.find({
      ...saleDeviceFilter(deviceKey),
      status: "FISCALISED",
      isTest: { $ne: true },
      "fiscal.fiscalDayNo": fiscalDayNo,
    })
      .select("currency kind lines.taxPercent lines.lineTotalExcl lines.vatAmount lines.lineTotalIncl")
      .lean<BreakdownSale[]>();
    return buildBreakdown(sales, basis);
  } catch (e) {
    logger.warn({ deviceKey, fiscalDayNo, err: e instanceof Error ? e.message : String(e) }, "Could not build the Z-report breakdown");
    return null;
  }
}
