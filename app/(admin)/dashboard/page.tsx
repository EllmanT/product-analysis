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
import { FilterIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default async function Page() {

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
  <div className="flex items-center gap-2 mt-2">
    <Separator
      orientation="vertical"
      className="mx-2 data-[orientation=vertical]:h-4"
    />
    <h1 className="text-base font-medium">Dashboard</h1>
  </div>
  </div>
          <section className="ml-6 mr-6 mt-5 flex justify-between gap-2 max-sm:flex-col sm:items-center bg-white items-center rounded-md p-2">
      
        <GlobalFilter
                 label="Branch"

          filters={HomePageBranchesFilters}
          otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
          <GlobalFilter
                   label="Week"

          filters={HomePageWeek}
          otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
          <GlobalFilter
                   label="Month"
          filters={HomePageMonth}
          otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
         <GlobalFilter
         label="Year"
          filters={HomePageYear}
          otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
                  
 <Button
          className="mt-5 primary-gradient min-h-[46px] px-4 py-3 !text-light-900 bg-blue-500"
          // asChild
        >
          <FilterIcon/>
          <Link href="/">Apply filter</Link>
        </Button>
        
      </section>
       
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">
          <SectionCards />

          </div>
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              <ChartAreaInteractive />
            </div>
           


          </div>
           <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
      <DataTable data={projects} columns={columns} />

              </div>
            </div>
       
        </div>
      </div>
    </div>
  );
}
