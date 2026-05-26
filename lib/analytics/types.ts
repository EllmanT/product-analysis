export type Granularity = "daily" | "weekly" | "monthly";
export type Metric = "sales" | "units" | "stockValue";
export type TimeSeriesScope = "branch" | "product";

export type TimeSeriesPoint = {
  date: string;
  [seriesKey: string]: number | string;
};

export type BranchReportRow = {
  date: string;
  branch: string;
  revenue: number;
  units: number;
  sales: number;
};

export type TopProductResult = {
  productId: string;
  code: string;
  name: string;
  totalSales: number;
  totalUnits: number;
};

export type BuildTimeSeriesParams = {
  storeId: string;
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  metric: Metric;
  scope: TimeSeriesScope;
  branchId?: string;
  productId?: string;
};

export type AnalyticsFilters = {
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  metric: Metric;
};
