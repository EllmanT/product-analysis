"use client";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { formUrlQuery } from "@/lib/url";
import { Label } from "../ui/label";

interface Filter {
  name: string;
  value: string;
}

interface Props {
  label:string;
  filters: Filter[];
  otherClasses?: string;
  containerClasses?: string;
  queryKey:string
}

const GlobalFilter = ({
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
    <div className={cn("relative max-w-[60px]", containerClasses)}>
      <Label className="justify-center m-1 ml-10">{label}</Label>
      <Select
        onValueChange={handleUpdateParams}
        defaultValue={selected || undefined}
      >        <SelectTrigger
          className={cn(
            "body-regular no-focus light-border background-light800_dark300 text-dark500_light700 border px-5 py-2.5",
            otherClasses
          )}
        >
          <div className="line-clamp-1 flex-1 text-left">
            <SelectValue placeholder="Select a filter" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {filters.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export default GlobalFilter;
