"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

import { Button } from "../ui/button"
import { Download,  Printer,} from "lucide-react"
import Link from "next/link"

type ChartConfig = Record<string, { label: string; color: string }>

function generateChartConfig(chartData: any[]): ChartConfig {
  const uniqueStores = new Set<string>()

  chartData.forEach(entry => {
    Object.keys(entry).forEach(key => {
      if (key !== 'date') {
        uniqueStores.add(key)
      }
    })
  })
  function getRandomHexColor(): string {
  // Generate a random integer between 0 and 0xFFFFFF
  const randomInt = Math.floor(Math.random() * 0xffffff)
  // Convert to hex and pad with 0s if needed
  return `#${randomInt.toString(16).padStart(6, '0')}`
}

  const chartConfig: ChartConfig = {}
  Array.from(uniqueStores).forEach((store) => {
    chartConfig[store] = {
      label: store,
      color: getRandomHexColor(),
    }
  })

  return chartConfig
}

interface Props {
  branch?: Branch
  startDate?: Date
  endDate?: Date
  chartData: {
    date: string
    [storeName: string]: number | string // dynamic keys for stores
  }[]
}

export function BranchSalesLineChart({ branch, startDate, endDate, chartData }: Props) {
  // Default start/end dates to current year's range if not provided
  const defaultStartDate = new Date(new Date().getFullYear(), 0, 1) // Jan 1 current year
  const defaultEndDate = new Date(new Date().getFullYear(), 11, 31) // Dec 31 current year

  // Use props or default
  const effectiveStartDate = startDate ?? defaultStartDate
  const effectiveEndDate = endDate ?? defaultEndDate

  const [timeRange, setTimeRange] = React.useState("all") // or "30d", "7d" if you keep ranges

  const chartConfig = generateChartConfig(chartData)

  // Filter data by the effective dates
  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    // Filter between effectiveStartDate and effectiveEndDate inclusive
    return date >= effectiveStartDate && date <= effectiveEndDate
  })

  return (
    <Card>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-2 sm:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>⚡️ Sales Trend</CardTitle>
          <CardDescription>
            Overview of estimated revenue by branch over time
          </CardDescription>
        </div>

        <Button className="primary-gradient h-9 px-3 py-1 text-sm !text-light-900 bg-green-900">
          <Download />
          <Link href="/">Excel</Link>
        </Button>
        <Button className="primary-gradient h-9 px-3 py-1 text-sm !text-light-900 bg-red-700">
          <Printer />
          <Link href="/">PDF</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filteredData}>
          
<YAxis   
tickLine={false}
    axisLine={false}
    tickFormatter={(value) => {
      // Format numbers nicely, e.g., with commas or shorten large numbers
      if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M"
      if (value >= 1_000) return (value / 1_000).toFixed(1) + "K"
      return value.toString()
    }}
  />
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  indicator="dot"
                />
              }
            />
            {/* ✅ Dynamically render one Area per store */}
            {Object.entries(chartConfig).map(([store, { color }]) => (
              <Area
                key={store}
                dataKey={store}
                type="linear"
                fill="none"
                stroke={color}
                stackId="a"
              />
            ))}

            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
