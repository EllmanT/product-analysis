"use client";

import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { AnalyticsLineChart } from "@/components/analytics/AnalyticsLineChart";
import { SectionCards } from "@/components/statistics/StatisticsSection";
import { Separator } from "@/components/ui/separator";
import { useAnalyticsChartData } from "@/hooks/useAnalyticsChartData";
import { METRIC_LABELS } from "@/lib/analytics/defaults";
import { useCallback, useEffect, useState } from "react";

type DashboardAnalytics = {
  productCount?: number;
  currentStockQty?: number;
  estStockValue?: number;
  totalEstimatedSales?: number;
  totalBranches?: number;
  totalQuotations?: number;
  totalInvoices?: number;
  totalUploadFiles?: number;
  totalStoreUsers?: number;
};

export default function Page() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardAnalytics>();

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

  const loadChart = useCallback(() => {
    if (storeId) fetchChart({ storeId, scope: "branch" });
  }, [storeId, fetchChart]);

  useEffect(() => {
    const init = async () => {
      try {
        const [branchRes, statsRes] = await Promise.all([
          fetch("/api/branches"),
          fetch("/api/analytics"),
        ]);
        if (branchRes.ok) {
          const { data } = await branchRes.json();
          setBranches(data.branches);
          setStoreId(data.branches[0]?.storeId?._id ?? "");
        }
        if (statsRes.ok) {
          const { data } = await statsRes.json();
          setDashboardStats(data);
        }
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

  if (initLoading) return <div className="p-6">Loading dashboard…</div>;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
        <div className="flex items-center gap-2 mt-2">
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">Dashboard</h1>
        </div>
      </div>

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="flex-col">
            <SectionCards dashboardStats={dashboardStats} />
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
              setTimeout(loadChart, 0);
            }}
            loading={chartLoading}
          />

          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              <AnalyticsLineChart
                data={chartData}
                metric={filters.metric}
                granularity={filters.granularity}
                title={`${METRIC_LABELS[filters.metric]} trend`}
                loading={chartLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
