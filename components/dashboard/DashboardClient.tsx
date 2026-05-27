"use client"

import { useCallback, useEffect } from "react"
import { useAnalyticsChartData } from "@/hooks/useAnalyticsChartData"
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar"
import { AnalyticsLineChart } from "@/components/analytics/AnalyticsLineChart"
import { METRIC_LABELS } from "@/lib/analytics/defaults"

type Props = {
  storeId: string
  branches: Branch[]
}

export function DashboardClient({ storeId, branches }: Props) {
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
  } = useAnalyticsChartData()

  const loadChart = useCallback(() => {
    fetchChart({ storeId, scope: "branch" })
  }, [storeId, fetchChart])

  useEffect(() => {
    loadChart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsFilterBar
        branches={branches}
        filters={filters}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onGranularityChange={setGranularity}
        onMetricChange={setMetric}
        onApply={loadChart}
        onReset={() => {
          reset()
          setTimeout(loadChart, 0)
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
  )
}
