import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import ZReport from "@/database/zReport.model";

/**
 * Every closed fiscal day. `?deviceKey=central|<FiscalDevice id>` shows one device. Each device has its
 * own fiscal day, so totals are also given per device; the overall sum is only meaningful as a company total.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();
    const deviceKey = new URL(request.url).searchParams.get("deviceKey");
    // Reports written before multi-device support have no key and belong to the central device.
    const filter =
      deviceKey === "central"
        ? { $or: [{ fiscalDeviceKey: "central" }, { fiscalDeviceKey: { $exists: false } }] }
        : deviceKey
          ? { fiscalDeviceKey: deviceKey }
          : {};
    const reports = await ZReport.find(filter).sort({ closedAt: -1 }).lean();
    const byDevice = new Map<string, { deviceKey: string; deviceName: string; reportCount: number; sumUsd: number; sumZwg: number }>();

    let grandUsd = 0;
    let grandZwg = 0;
    let countUsd = 0;
    let countZwg = 0;
    for (const r of reports) {
      const key = r.fiscalDeviceKey || "central";
      const d = byDevice.get(key) ?? { deviceKey: key, deviceName: r.deviceName || (key === "central" ? "Central device" : key), reportCount: 0, sumUsd: 0, sumZwg: 0 };
      d.reportCount++;
      d.sumUsd += r.totalSalesUsd ?? 0;
      d.sumZwg += r.totalSalesZwg ?? 0;
      byDevice.set(key, d);
      if (r.totalSalesUsd != null) {
        grandUsd += r.totalSalesUsd;
        countUsd++;
      }
      if (r.totalSalesZwg != null) {
        grandZwg += r.totalSalesZwg;
        countZwg++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        reports: reports.map((r) => ({
          _id: String(r._id),
          source: r.source,
          closedAt: r.closedAt,
          fiscalDayNo: r.fiscalDayNo,
          fiscalDeviceKey: r.fiscalDeviceKey || "central",
          deviceName: r.deviceName || (r.fiscalDeviceKey && r.fiscalDeviceKey !== "central" ? r.fiscalDeviceKey : "Central device"),
          deviceId: r.deviceId ?? null,
          totalSalesUsd: r.totalSalesUsd,
          totalSalesZwg: r.totalSalesZwg,
          createdAt: r.createdAt,
        })),
        totalsByDevice: [...byDevice.values()],
        totals: {
          sumUsd: grandUsd,
          sumZwg: grandZwg,
          reportCount: reports.length,
          reportsWithUsd: countUsd,
          reportsWithZwg: countZwg,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Z-reports";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
