import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import {
  buildBranchReports,
  parseAnalyticsParams,
} from "@/lib/analytics/buildTimeSeries";
import { requireStoreAccess } from "@/lib/analytics/requireStoreAccess";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = parseAnalyticsParams(searchParams);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const access = await requireStoreAccess(parsed.storeId);
  if ("error" in access) return access.error;

  await dbConnect();

  try {
    const data = await buildBranchReports({
      storeId: parsed.storeId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      granularity: parsed.granularity,
      branchId: parsed.branchId,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build reports";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
