
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
import { Calendar1Icon, ComputerIcon, FilterIcon, StoreIcon } from "lucide-react";
import { columnsBranchesUp } from "@/components/data-table/columns/columnsBranchesUp";
import StatisticsCard from "@/components/cards/StatisticsCard";
import { IconCash, IconCashPlus, IconSearch, IconTrendingUp } from "@tabler/icons-react";
import UploadDetailsCard from "@/components/cards/UploadDetailsCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutoComplete } from "@/components/Autocomplete";
import { useState } from "react";
import { columnsUploadDetails } from "@/components/data-table/columns/columnsUploadDetails";
import { Separator } from "@/components/ui/separator";

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
    <h1 className="text-base font-medium">Upload Details</h1>
  </div>

  <div className="text-sm text-muted-foreground">
    Upload Id: <span className="font-medium text-black">#MA5434</span> | Jane Doe
  </div>
</div>

   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">
                <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">

  <UploadDetailsCard
      label="Total Products"
      value="5000"
      bgColor="bg-blue-500"
      icon={StoreIcon}
      />      
      <UploadDetailsCard
      label="Total Quantity"
      value="5000"
      bgColor="bg-purple-500"
      icon={ComputerIcon}
      />    <UploadDetailsCard
      label="Total Value"
      value="$213,300"
      bgColor="bg-green-500"
      icon={IconCash}
      />    <UploadDetailsCard
      label="Upload Date"
      value="28 May 2025"
      bgColor="bg-orange-500"
      icon={Calendar1Icon}
      />  
        </div>
          </div>
                       <section className="ml-6 mr-6 mt-1 flex justify-between gap-2 max-sm:flex-col sm:items-center bg-white items-center rounded-md p-2">
      
        <span className="font-medium">
            Product List
        </span>
      
      <div className="flex items-center gap-1">
           <QueryClientProvider client={queryClient}>
          <AutoComplete
            selectedValue={selectedValue}
        onSelectedValueChange={setSelectedValue}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        items={ []}
        isLoading={false}
        emptyMessage="No pokemon found."
    isLabelVisible={false}
          />
          </QueryClientProvider>
           <Button
          className="primary-gradient h-9 px-4 py-1 !text-light-900 bg-blue-500"
          // asChild
        >
          <IconSearch/>
          <Link href="/">Search</Link>
        </Button>
        </div>
      
         
                  

        
      </section>
           <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
      <DataTable data={projects} columns={columnsUploadDetails} isVisible={false} />

              </div>
            </div>
       
        </div>
      </div>
    </div>
  );
}
