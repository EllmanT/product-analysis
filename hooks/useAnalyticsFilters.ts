"use client";

import { useCallback, useMemo, useState } from "react";
import type { AnalyticsFilters, Granularity, Metric } from "@/lib/analytics/types";
import {
  formatDateParam,
  getDefaultDateRange,
} from "@/lib/analytics/defaults";

export function useAnalyticsFilters(initial?: Partial<AnalyticsFilters>) {
  const defaults = getDefaultDateRange();

  const [startDate, setStartDate] = useState<Date>(
    initial?.startDate ?? defaults.startDate
  );
  const [endDate, setEndDate] = useState<Date>(
    initial?.endDate ?? defaults.endDate
  );
  const [granularity, setGranularity] = useState<Granularity>(
    initial?.granularity ?? "daily"
  );
  const [metric, setMetric] = useState<Metric>(initial?.metric ?? "sales");

  const reset = useCallback(() => {
    const d = getDefaultDateRange();
    setStartDate(d.startDate);
    setEndDate(d.endDate);
    setGranularity("daily");
    setMetric("sales");
  }, []);

  const filters: AnalyticsFilters = useMemo(
    () => ({ startDate, endDate, granularity, metric }),
    [startDate, endDate, granularity, metric]
  );

  const toQueryParams = useCallback(
    (storeId: string, extra?: Record<string, string>) => ({
      storeId,
      startDate: formatDateParam(startDate),
      endDate: formatDateParam(endDate),
      granularity,
      metric,
      ...extra,
    }),
    [startDate, endDate, granularity, metric]
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
    toQueryParams,
  };
}
