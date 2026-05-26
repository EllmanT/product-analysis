"use client";

import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { AnalyticsLineChart } from "@/components/analytics/AnalyticsLineChart";
import { SectionCards } from "@/components/statistics/StatisticsSection";
import { Separator } from "@/components/ui/separator";
import { useAnalyticsChartData } from "@/hooks/useAnalyticsChartData";
import { METRIC_LABELS } from "@/lib/analytics/defaults";
import Link from "next/link";
import { BarChart2, Upload, Users, GitBranch } from "lucide-react";
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

const countFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

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

          <div className="px-4 lg:px-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  {
                    label: "Upload Stock",
                    href: "/uploads/upload",
                    icon: Upload,
                    desc: "Upload today's stock file",
                    color: "bg-emerald-100 text-emerald-600",
                    count: dashboardStats?.totalUploadFiles ?? 0,
                  },
                  {
                    label: "Branch Analytics",
                    href: "/branch-analytics",
                    icon: BarChart2,
                    desc: "View stock trends by branch",
                    color: "bg-blue-100 text-blue-600",
                    count: dashboardStats?.totalBranches ?? 0,
                  },
                  {
                    label: "Branches",
                    href: "/branches",
                    icon: GitBranch,
                    desc: "Manage branch locations",
                    color: "bg-indigo-100 text-indigo-600",
                    count: dashboardStats?.totalBranches ?? 0,
                  },
                  {
                    label: "Team",
                    href: "/users",
                    icon: Users,
                    desc: "Manage staff accounts",
                    color: "bg-slate-100 text-slate-600",
                    count: dashboardStats?.totalStoreUsers ?? 0,
                  },
                ] as const
              ).map(({ label, href, icon: Icon, desc, color, count }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      data-testid={
                        label === "Upload Stock" ? "stat-upload-files" : undefined
                      }
                      className="text-right text-2xl font-semibold tabular-nums text-slate-900"
                    >
                      {countFormatter.format(count)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
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
