import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import ZReport from "@/database/zReport.model";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
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

    return NextResponse.json({
      success: true,
      data: {
        _id: String(report._id),
        source: report.source,
        closedAt: report.closedAt,
        fiscalDayNo: report.fiscalDayNo,
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
