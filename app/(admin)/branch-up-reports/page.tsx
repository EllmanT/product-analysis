"use client";

import { DataTable } from "@/components/data-table/index";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import {
  columnAllUploadReports,
  type BranchUploadReportRow,
} from "@/components/data-table/columns/columnsBranchesUp";
import { Separator } from "@/components/ui/separator";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function Page() {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get("branch");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState("");
  const [reportData, setReportData] = useState<BranchUploadReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  const {
    filters,
    setStartDate,
    setEndDate,
    setGranularity,
    setMetric,
    reset,
    toQueryParams,
  } = useAnalyticsFilters();

  const loadReports = useCallback(async () => {
    if (!storeId) return;
    setTableLoading(true);
    try {
      const params = new URLSearchParams(
        toQueryParams(storeId, {
          ...(branchParam && branchParam !== "all"
            ? { branchId: branchParam }
            : {}),
        })
      );
      const res = await fetch(`/api/analytics/branch-reports?${params}`);
      if (!res.ok) throw new Error("Failed to fetch reports");
      const json = await res.json();
      setReportData(json.data ?? []);
    } catch (err) {
      console.error(err);
      setReportData([]);
    } finally {
      setTableLoading(false);
    }
  }, [storeId, branchParam, toQueryParams]);

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
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (storeId) loadReports();
  }, [storeId, loadReports]);

  const filteredReports = useMemo(() => {
    if (!branchParam || branchParam === "all") return reportData;
    const branch = branches.find((b) => b._id === branchParam);
    if (!branch) return reportData;
    return reportData.filter((r) => r.branch === branch.location);
  }, [reportData, branchParam, branches]);

  if (loading) return <div className="p-6">Loading reports…</div>;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Branch Upload Reports</h1>
      </div>

      <AnalyticsFilterBar
        branches={branches}
        filters={filters}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onGranularityChange={setGranularity}
        onMetricChange={setMetric}
        onApply={loadReports}
        onReset={() => {
          reset();
          window.location.href = window.location.pathname;
        }}
        loading={tableLoading}
        showMetric={false}
      />

      <div className="px-4 lg:px-6 py-4">
        {tableLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading report data…
          </div>
        ) : (
          <DataTable data={filteredReports} columns={columnAllUploadReports} />
        )}
      </div>
    </div>
  );
}
