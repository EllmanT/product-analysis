import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import ZReport from "@/database/zReport.model";

export async function GET() {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();
    const reports = await ZReport.find().sort({ closedAt: -1 }).lean();

    let grandUsd = 0;
    let grandZwg = 0;
    let countUsd = 0;
    let countZwg = 0;
    for (const r of reports) {
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
          totalSalesUsd: r.totalSalesUsd,
          totalSalesZwg: r.totalSalesZwg,
          createdAt: r.createdAt,
        })),
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
