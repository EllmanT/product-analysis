import type { Granularity, Metric } from "./types";

export const MAX_DAILY_RANGE_DAYS = 90;
export const MAX_RANGE_DAYS = 365;

export function getDefaultDateRange(): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

export function validateDateRange(
  startDate: Date,
  endDate: Date,
  granularity: Granularity
): string | null {
  if (startDate > endDate) return "Start date must be before end date";
  const days =
    Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (granularity === "daily" && days > MAX_DAILY_RANGE_DAYS) {
    return `Daily view supports up to ${MAX_DAILY_RANGE_DAYS} days`;
  }
  if (days > MAX_RANGE_DAYS) {
    return `Date range supports up to ${MAX_RANGE_DAYS} days`;
  }
  return null;
}

export function formatDateParam(d: Date): string {
  return d.toISOString().split("T")[0];
}

export const METRIC_LABELS: Record<Metric, string> = {
  sales: "Estimated Sales",
  units: "Units Sold",
  stockValue: "Stock Value",
};

export const METRIC_Y_AXIS: Record<Metric, string> = {
  sales: "Sales ($)",
  units: "Units",
  stockValue: "Value ($)",
};

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
