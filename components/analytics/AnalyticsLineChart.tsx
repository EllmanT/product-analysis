"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { Granularity, Metric, TimeSeriesPoint } from "@/lib/analytics/types";
import { METRIC_LABELS, METRIC_Y_AXIS } from "@/lib/analytics/defaults";

const SERIES_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#ca8a04",
  "#be185d",
];

function buildChartConfig(data: TimeSeriesPoint[]): ChartConfig {
  const keys = new Set<string>();
  data.forEach((entry) => {
    Object.keys(entry).forEach((k) => {
      if (k !== "date") keys.add(k);
    });
  });
  const config: ChartConfig = {};
  Array.from(keys).forEach((key, i) => {
    config[key] = {
      label: key,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    };
  });
  return config;
}

function formatXLabel(dateStr: string, granularity: Granularity): string {
  const d = parseISO(dateStr);
  if (granularity === "monthly") return format(d, "MMM yyyy");
  if (granularity === "weekly") return `Wk ${format(d, "d MMM")}`;
  return format(d, "d MMM");
}

type Props = {
  data: TimeSeriesPoint[];
  metric: Metric;
  granularity: Granularity;
  title?: string;
  description?: string;
  loading?: boolean;
  selectedBranch?: Branch;
};

export function AnalyticsLineChart({
  data,
  metric,
  granularity,
  title,
  description,
  loading = false,
  selectedBranch,
}: Props) {
  const chartConfig = React.useMemo(() => buildChartConfig(data), [data]);

  const displayData = React.useMemo(() => {
    if (!selectedBranch) return data;
    const branchName = selectedBranch.location;
    return data.map((entry) => {
      const filtered: TimeSeriesPoint = { date: entry.date };
      if (branchName in entry) {
        filtered[branchName] = entry[branchName];
      } else {
        filtered[branchName] = 0;
      }
      return filtered;
    });
  }, [data, selectedBranch]);

  const chartTitle =
    title ?? `${METRIC_LABELS[metric]} by branch`;
  const chartDesc =
    description ??
    `${METRIC_Y_AXIS[metric]} over time (${granularity} view)`;

  return (
    <Card>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-3 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-base">{chartTitle}</CardTitle>
          <CardDescription>{chartDesc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Loading chart…
          </div>
        ) : displayData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No data for this period. Try adjusting the date range or upload stock files.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <AreaChart data={displayData}>
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  if (metric === "units") return String(value);
                  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
                  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
                  return `$${value}`;
                }}
              />
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value) => formatXLabel(String(value), granularity)}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      formatXLabel(String(value), granularity)
                    }
                    indicator="dot"
                  />
                }
              />
              {Object.entries(chartConfig).map(([series, { color }]) => (
                <Area
                  key={series}
                  dataKey={series}
                  type="monotone"
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  dot={displayData.length <= 14}
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
