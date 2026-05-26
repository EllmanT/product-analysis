"use client";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { formUrlQuery } from "@/lib/url";
import { Label } from "../ui/label";

interface Props {
  label:string;
  filters: Branch[];
  otherClasses?: string;
  containerClasses?: string;
  queryKey:string
}

const BranchFilter = ({
  label,
  filters,
  otherClasses = "",
  containerClasses = "",
  queryKey,
}: Props) => {
  const router = useRouter();

  const searchParams = useSearchParams();

  // const paramsFilter = searchParams.get("filter");
  const selected = searchParams.get(queryKey); // <-- Get value for that key

  const handleUpdateParams = (value: string) => {
    const newUrl = formUrlQuery({
      params: searchParams.toString(),
      key: queryKey,
      value,
    });
    router.push(newUrl, { scroll: false });
  };

  return (
    <div className={cn("flex min-w-[190px] flex-col gap-1.5", containerClasses)}>
      <Label className="px-1 text-xs">{label}</Label>
      <Select
        onValueChange={handleUpdateParams}
        defaultValue={selected || undefined}
      >
        <SelectTrigger
          className={cn(
            "body-regular no-focus light-border background-light800_dark300 text-dark500_light700 h-9 border px-2 py-2.5",
            otherClasses
          )}
        >
          <div className="line-clamp-1 flex-1 text-left">
            <SelectValue placeholder="Select a filter" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all" defaultValue="all">
                All
            </SelectItem>
            {filters.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.location}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export default BranchFilter;
