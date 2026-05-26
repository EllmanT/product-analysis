"use client";

import * as React from "react";
import { ChevronDownIcon, FilterIcon, RefreshCcw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BranchFilter from "@/components/filter/BranchFilter";
import type { AnalyticsFilters, Granularity, Metric } from "@/lib/analytics/types";
import {
  GRANULARITY_LABELS,
  METRIC_LABELS,
} from "@/lib/analytics/defaults";

type Props = {
  branches: Branch[];
  filters: AnalyticsFilters;
  onStartDateChange: (d: Date) => void;
  onEndDateChange: (d: Date) => void;
  onGranularityChange: (g: Granularity) => void;
  onMetricChange?: (m: Metric) => void;
  onApply: () => void;
  onReset: () => void;
  showMetric?: boolean;
  showBranch?: boolean;
  loading?: boolean;
};

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="px-1 text-xs">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-40 justify-between font-normal h-9"
          >
            {format(value, "dd MMM yyyy")}
            <ChevronDownIcon className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            captionLayout="dropdown"
            onSelect={(d) => {
              if (d) {
                onChange(d);
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AnalyticsFilterBar({
  branches,
  filters,
  onStartDateChange,
  onEndDateChange,
  onGranularityChange,
  onMetricChange,
  onApply,
  onReset,
  showMetric = true,
  showBranch = true,
  loading = false,
}: Props) {
  return (
    <section className="mx-4 mt-4 flex flex-wrap items-end justify-between gap-3 rounded-md border bg-white p-3 lg:mx-6">
      <div className="flex flex-wrap items-end gap-3">
        <DatePickerField
          label="From"
          value={filters.startDate}
          onChange={onStartDateChange}
        />
        <DatePickerField
          label="To"
          value={filters.endDate}
          onChange={onEndDateChange}
        />

        <div className="flex flex-col gap-1.5">
          <Label className="px-1 text-xs">Granularity</Label>
          <Select
            value={filters.granularity}
            onValueChange={(v) => onGranularityChange(v as Granularity)}
          >
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
                <SelectItem key={g} value={g}>
                  {GRANULARITY_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showMetric && onMetricChange && (
          <div className="flex flex-col gap-1.5">
            <Label className="px-1 text-xs">Metric</Label>
            <Select
              value={filters.metric}
              onValueChange={(v) => onMetricChange(v as Metric)}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {showBranch && branches.length > 0 && (
          <BranchFilter
            label="Branch"
            filters={branches}
            containerClasses="max-md:flex"
            queryKey="branch"
          />
        )}
        <Button
          className="h-9 bg-blue-600 text-white hover:bg-blue-700"
          onClick={onApply}
          disabled={loading}
        >
          <FilterIcon className="size-4 mr-1" />
          Apply
        </Button>
        <Button
          variant="outline"
          className="h-9"
          onClick={onReset}
          disabled={loading}
        >
          <RefreshCcw className="size-4 mr-1" />
          Reset
        </Button>
      </div>
    </section>
  );
}
