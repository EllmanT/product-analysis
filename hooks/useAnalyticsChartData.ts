"use client";

import { useCallback, useState } from "react";
import type { TimeSeriesPoint } from "@/lib/analytics/types";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";

type FetchOptions = {
  storeId: string;
  scope?: "branch" | "product";
  productId?: string;
  branchId?: string;
};

export function useAnalyticsChartData() {
  const {
    startDate,
    endDate,
    granularity,
    metric,
    setStartDate,
    setEndDate,
    setGranularity,
    setMetric,
    reset,
    filters,
    toQueryParams,
  } = useAnalyticsFilters();

  const [chartData, setChartData] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChart = useCallback(
    async (options: FetchOptions) => {
      if (!options.storeId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(
          toQueryParams(options.storeId, {
            scope: options.scope ?? "branch",
            ...(options.productId ? { productId: options.productId } : {}),
            ...(options.branchId ? { branchId: options.branchId } : {}),
          })
        );
        const res = await fetch(`/api/analytics/time-series?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load chart");
        }
        const json = await res.json();
        setChartData(json.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chart");
        setChartData([]);
      } finally {
        setLoading(false);
      }
    },
    [toQueryParams]
  );

  return {
    startDate,
    endDate,
    granularity,
    metric,
    setStartDate,
    setEndDate,
    setGranularity,
    setMetric,
    reset,
    filters,
    chartData,
    loading,
    error,
    fetchChart,
    setChartData,
  };
}
