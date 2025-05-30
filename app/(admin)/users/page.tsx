"use client"
import { ChartAreaInteractive } from "@/components/charts/LineChartInteractive";
import { SectionCards } from "@/components/statistics/StatisticsSection";

// import data from "./data.json";
import { projects} from "@/app/data";
import { columns } from "@/components/data-table/columns/columns";
import { DataTable } from "@/components/data-table/index";
import DataTableTopHeader from "@/components/data-table/Header";
import GlobalFilter from "@/components/filter/GlobalFilter";
import { HomePageBranchesFilters,  HomePageMonth, HomePageWeek, HomePageYear, Role } from "@/constants/filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FilterIcon } from "lucide-react";
import { columnsBranchesUp } from "@/components/data-table/columns/columnsBranchesUp";
import { Separator } from "@/components/ui/separator";
import { columnsAllUploads } from "@/components/data-table/columns/columnAllUploads";
import { columnAllUsers } from "@/components/data-table/columns/columnAllUsers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AutoComplete } from "@/components/Autocomplete";

export default function Page() {
      const queryClient = new QueryClient()
    const [searchValue, setSearchValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
  <div className="flex items-center gap-2 mt-2">
    <Separator
      orientation="vertical"
      className="mx-2 data-[orientation=vertical]:h-4"
    />
    <h1 className="text-base font-medium">Users</h1>
  </div>
  </div>
<section className="ml-6 mr-6 mt-5 flex justify-between gap-4 max-sm:flex-col sm:items-center bg-white rounded-md p-4">
  {/* Left side: AutoComplete */}
  <div className="w-[200px]">
    <QueryClientProvider client={queryClient}>
      <AutoComplete
        selectedValue={selectedValue}
        onSelectedValueChange={setSelectedValue}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        items={[]}
        isLoading={false}
        emptyMessage="No pokemon found."
      />
    </QueryClientProvider>
  </div>

  {/* Right side: Filters + Button */}
  <div className="flex flex-wrap items-center gap-2 justify-end">
    <GlobalFilter
      label="Branch"
      filters={HomePageBranchesFilters}
      containerClasses="max-md:flex"
    />
    <GlobalFilter
      label="Role"
      filters={Role}
      containerClasses="max-md:flex"
    />
    <Button className="h-9 px-4 py-1  !text-light-900 bg-blue-500 mt-5 flex items-center gap-2">
      <FilterIcon />
      <Link href="/">Apply filter</Link>
    </Button>
  </div>
</section>

       
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">

          </div>
         
           <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
      <DataTable data={projects} columns={columnAllUsers} isVisible={false} />

              </div>
            </div>
       
        </div>
      </div>
    </div>
  );
}
