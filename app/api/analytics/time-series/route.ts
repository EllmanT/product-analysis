import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import {
  buildTimeSeries,
  parseAnalyticsParams,
} from "@/lib/analytics/buildTimeSeries";
import { requireStoreAccess } from "@/lib/analytics/requireStoreAccess";
import type { TimeSeriesScope } from "@/lib/analytics/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = parseAnalyticsParams(searchParams);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const scope = (searchParams.get("scope") ?? "branch") as TimeSeriesScope;
  if (scope === "product" && !parsed.productId) {
    return NextResponse.json(
      { error: "productId is required when scope=product" },
      { status: 400 }
    );
  }

  const access = await requireStoreAccess(parsed.storeId);
  if ("error" in access) return access.error;

  await dbConnect();

  try {
    const data = await buildTimeSeries({
      storeId: parsed.storeId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      granularity: parsed.granularity,
      metric: parsed.metric,
      scope,
      branchId: parsed.branchId,
      productId: parsed.productId,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build time series";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
