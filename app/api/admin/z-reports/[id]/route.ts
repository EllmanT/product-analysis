import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import FiscalDevice from "@/database/fiscalDevice.model";
import ZReport from "@/database/zReport.model";
import { getFiscalSettingsDoc } from "@/lib/services/fiscalSettings.service";
import { getCompanyProfile } from "@/lib/services/companyProfile.service";
import { computeDayBreakdown } from "@/lib/services/zReportBreakdown.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const denied = requirePermission(session, "/z-reports");
    if (denied) return denied;

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    await dbConnect();
    const report = await ZReport.findById(id).lean();
    if (!report || Array.isArray(report)) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const deviceKey = report.fiscalDeviceKey || "central";
    const [company, device] = await Promise.all([
      getCompanyProfile(),
      deviceKey === "central" || !Types.ObjectId.isValid(deviceKey)
        ? getFiscalSettingsDoc()
            .then((d) => ({ deviceId: d.deviceId, deviceSerialNumber: d.deviceSerialNumber }))
            .catch(() => null)
        : FiscalDevice.findById(deviceKey).select("deviceId deviceSerialNumber").lean<{ deviceId?: string; deviceSerialNumber?: string }>(),
    ]);
    // Reports written before the breakdown was stored are worked out now from the same day's receipts.
    const breakdown = report.breakdown ?? (await computeDayBreakdown(deviceKey, report.fiscalDayNo, "live"));

    return NextResponse.json({
      success: true,
      data: {
        company: {
          name: company.companyName || company.tradeName,
          address: company.address,
          phone: company.phone,
          tin: company.tin,
          vatNumber: company.vatNumber,
        },
        deviceSerialNumber: device?.deviceSerialNumber ?? null,
        breakdown: breakdown ?? null,
        setAsideCount: report.setAsideCount ?? 0,
        _id: String(report._id),
        source: report.source,
        closedAt: report.closedAt,
        fiscalDayNo: report.fiscalDayNo,
        fiscalDeviceKey: report.fiscalDeviceKey || "central",
        deviceName: report.deviceName || "Central device",
        deviceId: report.deviceId ?? device?.deviceId ?? null,
        totalSalesUsd: report.totalSalesUsd,
        totalSalesZwg: report.totalSalesZwg,
        rawCloseResponse: report.rawCloseResponse,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load report";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
