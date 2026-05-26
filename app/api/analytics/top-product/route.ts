import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import { buildTopProduct } from "@/lib/analytics/buildTimeSeries";
import { getDefaultDateRange, formatDateParam } from "@/lib/analytics/defaults";
import { requireStoreAccess } from "@/lib/analytics/requireStoreAccess";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");

  if (!storeId) {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 });
  }

  const access = await requireStoreAccess(storeId);
  if ("error" in access) return access.error;

  const { startDate: defStart, endDate: defEnd } = getDefaultDateRange();
  const startStr = searchParams.get("startDate");
  const endStr = searchParams.get("endDate");
  const startDate = startStr ? new Date(startStr) : defStart;
  const endDate = endStr ? new Date(endStr) : defEnd;
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  await dbConnect();

  const data = await buildTopProduct({ storeId, startDate, endDate });

  return NextResponse.json({
    success: true,
    data,
    range: {
      startDate: formatDateParam(startDate),
      endDate: formatDateParam(endDate),
    },
  });
}
