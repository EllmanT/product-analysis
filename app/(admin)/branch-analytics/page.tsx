"use client";

import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { AnalyticsLineChart } from "@/components/analytics/AnalyticsLineChart";
import { Separator } from "@/components/ui/separator";
import { useAnalyticsChartData } from "@/hooks/useAnalyticsChartData";
import { METRIC_LABELS } from "@/lib/analytics/defaults";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function Page() {
  const searchParams = useSearchParams();
  const branchId = searchParams.get("branch");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState("");
  const [initLoading, setInitLoading] = useState(true);

  const {
    filters,
    setStartDate,
    setEndDate,
    setGranularity,
    setMetric,
    reset,
    chartData,
    loading: chartLoading,
    fetchChart,
  } = useAnalyticsChartData();

  const selectedBranch = useMemo(
    () => branches.find((b) => b._id === branchId),
    [branchId, branches]
  );

  const loadChart = useCallback(() => {
    if (!storeId) return;
    fetchChart({
      storeId,
      scope: "branch",
      branchId: branchId && branchId !== "all" ? branchId : undefined,
    });
  }, [storeId, branchId, fetchChart]);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");
        const { data } = await res.json();
        setBranches(data.branches);
        setStoreId(data.branches[0]?.storeId?._id ?? "");
      } catch (err) {
        console.error(err);
      } finally {
        setInitLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (storeId) loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  if (initLoading) return <div className="p-6">Loading branch analytics…</div>;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Branch Analytics</h1>
      </div>

      <AnalyticsFilterBar
        branches={branches}
        filters={filters}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onGranularityChange={setGranularity}
        onMetricChange={setMetric}
        onApply={loadChart}
        onReset={() => {
          reset();
          window.location.href = window.location.pathname;
        }}
        loading={chartLoading}
        showMetric
      />

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              <AnalyticsLineChart
                data={chartData}
                metric={filters.metric}
                granularity={filters.granularity}
                title={`${METRIC_LABELS[filters.metric]} by branch`}
                selectedBranch={selectedBranch}
                loading={chartLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
