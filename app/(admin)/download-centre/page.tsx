"use client"

import { ChartAreaInteractive } from "@/components/charts/LineChartInteractive";
import { SectionCards } from "@/components/statistics/StatisticsSection";

// import data from "./data.json";
import { projects} from "@/app/data";
import { columns } from "@/components/data-table/columns/columns";
import { DataTable } from "@/components/data-table/index";
import DataTableTopHeader from "@/components/data-table/Header";
import GlobalFilter from "@/components/filter/GlobalFilter";
import { HomePageBranchesFilters,  HomePageMonth, HomePageWeek, HomePageYear } from "@/constants/filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FilterIcon, StoreIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutoComplete } from "@/components/Autocomplete";
import React, { startTransition, useState } from "react";
import DownloadCenterCard from "@/components/cards/DownloadCenterCard";
import { api } from "@/lib/api";
import {  downloadExportAll } from "@/app/api/products/downloadexcel";
import { Calendar } from "@/components/ui/calendar";
import { Calendar22 } from "@/components/Calendat";

export default function Page() {
    const queryClient = new QueryClient()
    const [searchValue, setSearchValue] = useState<string>("");
  const [open, setOpen] = React.useState(false)
const [date, setDate] = React.useState<Date>(new Date());
const [endDate, setEndDate] = React.useState<Date>(new Date());
  const handleStartDateChange = (date: Date) => {
    console.log("Selected Date:", date)
    setDate(date)
  }
    const handleEndDateChange = (enddate: Date) => {
    console.log("Selected Date:", enddate)
    setEndDate(enddate)
  }
console.log("date here", date)
const handleApplyFilter = (e: React.MouseEvent<HTMLButtonElement>) => {
   e.preventDefault()
  const params = new URLSearchParams(window.location.search);
  const frommonth = params.get("frommonth")|| "1";
  const fromweek = params.get("fromweek") || "1";
    const tomonth = params.get("tomonth")|| "1";
  const toweek = params.get("toweek") || "1";
  const year = params.get("year") || "2025";

  console.log(date)
  if (!frommonth || !fromweek || !year) {
    console.warn("❗ Missing filter values (month/week/year)");
    return;
  }

  startTransition(async () => {
  try {
    await downloadExportAll(date, endDate);
    console.log("✅ Export triggered successfully");
    // Optional: show toast or notification
  } catch (err) {
    console.error("❌ Export failed:", err);
    // Optional: show error toast
  }
  });
};


  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
  <div className="flex items-center gap-2 mt-2">
    <Separator
      orientation="vertical"
      className="mx-2 data-[orientation=vertical]:h-4"
    />
    <h1 className="text-base font-medium">Download Center</h1>
  </div>
  </div>
          <section className="ml-6 mr-6 mt-5 flex justify-between gap-2 max-sm:flex-col sm:items-center bg-white items-center rounded-md p-2">
       {/* <GlobalFilter
         label="Product Name"
          filters={HomePageYear}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        /> */}
        {/* <div className="">
           <QueryClientProvider client={queryClient}>
          <AutoComplete
            selectedValue={selectedValue}
        onSelectedValueChange={setSelectedValue}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        items={ []}
        isLoading={false}
        emptyMessage="No pokemon found."

          />
          </QueryClientProvider>
          
        </div> */}
        <Calendar22 label={"From"}  onDateChange={handleStartDateChange}/>
        <Calendar22 label={"To"}  onDateChange={handleEndDateChange}/>
        <GlobalFilter
                 label="Branch"

          filters={HomePageBranchesFilters}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
          queryKey="branch"
        />
       
          {/* <GlobalFilter
                   label="Week(From)"

          filters={HomePageWeek}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
          queryKey="fromweek"
        />
          <GlobalFilter
                   label="Month(From)"
          filters={HomePageMonth}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex "
          queryKey="frommonth"
        />
         
         <GlobalFilter
                   label="Week(To)"

          filters={HomePageWeek}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
          queryKey="toweek"
        />
          <GlobalFilter
                   label="Month(To)"
          filters={HomePageMonth}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
          queryKey="tomonth"
        /> */}
         <GlobalFilter
         label="Year"
          filters={HomePageYear}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
          queryKey="year"
        />
         
                  
 <Button
          className="mt-5 primary-gradient h-9 px-4 py-1 !text-light-900 bg-blue-500"
          // asChild
          onClick={handleApplyFilter}
        >
          <FilterIcon/>
       Filter
        </Button>
        
      </section>
       
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">

                            <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">

            <DownloadCenterCard
      label="Combined Report"
      value="5000"
      bgColor="bg-blue-500"
      icon={StoreIcon}
            description="Access comprehensive reports combining data from all branches for overall business analysis."

      />
                  <DownloadCenterCard
      label="Branch Report"
      value="5000"
      bgColor="bg-blue-500"
      icon={StoreIcon}
            description="Download detailed reports for individual branches including sales, inventory, and performance metrics."

      />
      </div>

          </div>
       
        </div>
      </div>
    </div>
  );
}
