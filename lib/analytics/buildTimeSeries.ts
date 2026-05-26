import { Types, type PipelineStage } from "mongoose";
import { format, startOfISOWeek, startOfMonth } from "date-fns";
import { UploadProduct } from "@/database";
import type {
  BranchReportRow,
  BuildTimeSeriesParams,
  Granularity,
  Metric,
  TimeSeriesPoint,
  TopProductResult,
} from "./types";
import { getDefaultDateRange, validateDateRange } from "./defaults";

type DailyRow = {
  day: string;
  branchKey: string;
  productId: string;
  sales: number;
  units: number;
  stockValue: number;
};

function bucketKey(day: string, granularity: Granularity): string {
  const d = new Date(day + "T12:00:00");
  if (granularity === "daily") return day;
  if (granularity === "weekly") return format(startOfISOWeek(d), "yyyy-MM-dd");
  return format(startOfMonth(d), "yyyy-MM-dd");
}

type SnapshotRow = {
  branchId: string;
  productId: string;
  day: string;
  qty: number;
  priceDouble: number;
  branchKey: string;
};

async function fetchDailyRows(params: {
  storeId: string;
  startDate: Date;
  endDate: Date;
  branchId?: string;
  productId?: string;
}): Promise<DailyRow[]> {
  const { storeId, startDate, endDate, branchId, productId } = params;
  const match: Record<string, unknown> = {
    storeId: new Types.ObjectId(storeId),
    upload_date: { $gte: startDate, $lte: endDate },
  };
  if (branchId) match.branchId = new Types.ObjectId(branchId);
  if (productId) match.productId = new Types.ObjectId(productId);

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$upload_date" } },
        priceDouble: { $toDouble: "$price" },
      },
    },
    { $sort: { branchId: 1, productId: 1, upload_date: 1 } },
    {
      $group: {
        _id: {
          branchId: "$branchId",
          productId: "$productId",
          day: "$day",
        },
        qty: { $last: "$qty" },
        priceDouble: { $last: "$priceDouble" },
      },
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id.branchId",
        foreignField: "_id",
        as: "branch",
      },
    },
    { $unwind: "$branch" },
    {
      $project: {
        branchId: { $toString: "$_id.branchId" },
        productId: { $toString: "$_id.productId" },
        day: "$_id.day",
        qty: 1,
        priceDouble: 1,
        branchKey: "$branch.location",
      },
    },
    { $sort: { branchId: 1, productId: 1, day: 1 } },
  ];

  const snapshots = (await UploadProduct.aggregate(pipeline)) as SnapshotRow[];
  const dailyRows: DailyRow[] = [];
  const prevByKey = new Map<string, number>();

  for (const snap of snapshots) {
    const key = `${snap.branchId}:${snap.productId}`;
    const prevQty = prevByKey.get(key) ?? snap.qty;
    const unitsSold = Math.max(prevQty - snap.qty, 0);
    dailyRows.push({
      day: snap.day,
      branchKey: snap.branchKey,
      productId: snap.productId,
      sales: unitsSold * snap.priceDouble,
      units: unitsSold,
      stockValue: snap.qty * snap.priceDouble,
    });
    prevByKey.set(key, snap.qty);
  }

  return dailyRows;
}

function aggregateToChart(
  dailyRows: DailyRow[],
  granularity: Granularity,
  metric: Metric
): TimeSeriesPoint[] {
  if (metric === "stockValue") {
    const periodBranchProduct = new Map<
      string,
      Map<string, Map<string, { day: string; stockValue: number }>>
    >();

    for (const row of dailyRows) {
      const period = bucketKey(row.day, granularity);
      if (!periodBranchProduct.has(period))
        periodBranchProduct.set(period, new Map());
      const branchMap = periodBranchProduct.get(period)!;
      if (!branchMap.has(row.branchKey)) branchMap.set(row.branchKey, new Map());
      const prodMap = branchMap.get(row.branchKey)!;
      const existing = prodMap.get(row.productId);
      if (!existing || row.day >= existing.day) {
        prodMap.set(row.productId, {
          day: row.day,
          stockValue: row.stockValue,
        });
      }
    }

    const points: TimeSeriesPoint[] = [];
    for (const [date, branchMap] of periodBranchProduct) {
      const point: TimeSeriesPoint = { date };
      for (const [branch, prodMap] of branchMap) {
        let total = 0;
        for (const v of prodMap.values()) total += v.stockValue;
        point[branch] = Math.round(total * 100) / 100;
      }
      points.push(point);
    }
    points.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    return points;
  }

  const grouped = new Map<string, Map<string, number>>();

  for (const row of dailyRows) {
    const period = bucketKey(row.day, granularity);
    if (!grouped.has(period)) grouped.set(period, new Map());
    const branchMap = grouped.get(period)!;
    const existing = branchMap.get(row.branchKey) ?? 0;
    branchMap.set(
      row.branchKey,
      existing + (metric === "sales" ? row.sales : row.units)
    );
  }

  const points: TimeSeriesPoint[] = [];
  for (const [date, branchMap] of grouped) {
    const point: TimeSeriesPoint = { date };
    for (const [branch, val] of branchMap) {
      point[branch] = Math.round(val * 100) / 100;
    }
    points.push(point);
  }

  points.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  return points;
}

function aggregateToReports(
  dailyRows: DailyRow[],
  granularity: Granularity
): BranchReportRow[] {
  const grouped = new Map<
    string,
    Map<string, { sales: number; units: number; stockByProduct: Map<string, { day: string; stockValue: number }> }>
  >();

  for (const row of dailyRows) {
    const period = bucketKey(row.day, granularity);
    if (!grouped.has(period)) grouped.set(period, new Map());
    const branchMap = grouped.get(period)!;
    const existing = branchMap.get(row.branchKey) ?? {
      sales: 0,
      units: 0,
      stockByProduct: new Map(),
    };
    existing.sales += row.sales;
    existing.units += row.units;
    const prev = existing.stockByProduct.get(row.productId);
    if (!prev || row.day >= prev.day) {
      existing.stockByProduct.set(row.productId, {
        day: row.day,
        stockValue: row.stockValue,
      });
    }
    branchMap.set(row.branchKey, existing);
  }

  const rows: BranchReportRow[] = [];
  for (const [date, branchMap] of grouped) {
    for (const [branch, vals] of branchMap) {
      rows.push({
        date,
        branch,
        revenue: Math.round(vals.sales * 100) / 100,
        units: Math.round(vals.units),
        sales: Math.round(vals.sales * 100) / 100,
      });
    }
  }

  rows.sort((a, b) =>
    a.date !== b.date
      ? a.date > b.date
        ? 1
        : -1
      : a.branch.localeCompare(b.branch)
  );
  return rows;
}

export async function buildTimeSeries(
  params: BuildTimeSeriesParams
): Promise<TimeSeriesPoint[]> {
  const err = validateDateRange(
    params.startDate,
    params.endDate,
    params.granularity
  );
  if (err) throw new Error(err);

  const dailyRows = await fetchDailyRows({
    storeId: params.storeId,
    startDate: params.startDate,
    endDate: params.endDate,
    branchId: params.branchId,
    productId: params.scope === "product" ? params.productId : undefined,
  });

  return aggregateToChart(dailyRows, params.granularity, params.metric);
}

export async function buildBranchReports(params: {
  storeId: string;
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  branchId?: string;
}): Promise<BranchReportRow[]> {
  const err = validateDateRange(
    params.startDate,
    params.endDate,
    params.granularity
  );
  if (err) throw new Error(err);

  const dailyRows = await fetchDailyRows({
    storeId: params.storeId,
    startDate: params.startDate,
    endDate: params.endDate,
    branchId: params.branchId,
  });

  return aggregateToReports(dailyRows, params.granularity);
}

export async function buildTopProduct(params: {
  storeId: string;
  startDate: Date;
  endDate: Date;
}): Promise<TopProductResult | null> {
  const dailyRows = await fetchDailyRows({
    storeId: params.storeId,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const byProduct = new Map<
    string,
    { sales: number; units: number }
  >();

  for (const row of dailyRows) {
    const existing = byProduct.get(row.productId) ?? { sales: 0, units: 0 };
    existing.sales += row.sales;
    existing.units += row.units;
    byProduct.set(row.productId, existing);
  }

  let topId: string | null = null;
  let topSales = -1;
  for (const [pid, vals] of byProduct) {
    if (vals.sales > topSales) {
      topSales = vals.sales;
      topId = pid;
    }
  }

  if (!topId) return null;

  const match = {
    storeId: new Types.ObjectId(params.storeId),
    productId: new Types.ObjectId(topId),
  };
  const meta = await UploadProduct.findOne(match).select("code name").lean();

  const totals = byProduct.get(topId)!;
  return {
    productId: topId,
    code: (meta?.code as string) ?? "",
    name: (meta?.name as string) ?? "Unknown",
    totalSales: Math.round(totals.sales * 100) / 100,
    totalUnits: Math.round(totals.units),
  };
}

export function parseAnalyticsParams(searchParams: URLSearchParams): {
  storeId: string;
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  metric: Metric;
  branchId?: string;
  productId?: string;
} | { error: string } {
  const storeId = searchParams.get("storeId");
  if (!storeId) return { error: "storeId is required" };

  const startStr = searchParams.get("startDate");
  const endStr = searchParams.get("endDate");
  const { startDate: defStart, endDate: defEnd } = getDefaultDateRange();

  const startDate = startStr ? new Date(startStr) : defStart;
  const endDate = endStr ? new Date(endStr) : defEnd;
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const granularity = (searchParams.get("granularity") ?? "daily") as Granularity;
  const metric = (searchParams.get("metric") ?? "sales") as Metric;
  const branchId = searchParams.get("branchId") ?? undefined;
  const productId = searchParams.get("productId") ?? undefined;

  if (!["daily", "weekly", "monthly"].includes(granularity)) {
    return { error: "Invalid granularity" };
  }
  if (!["sales", "units", "stockValue"].includes(metric)) {
    return { error: "Invalid metric" };
  }

  return {
    storeId,
    startDate,
    endDate,
    granularity,
    metric,
    branchId: branchId && branchId !== "all" ? branchId : undefined,
    productId,
  };
}
