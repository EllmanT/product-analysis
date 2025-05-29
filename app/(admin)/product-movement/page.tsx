"use client"
// import data from "./data.json";
import GlobalFilter from "@/components/filter/GlobalFilter";
import { HomePageBranchesFilters,  HomePageMonth, HomePageWeek, HomePageYear } from "@/constants/filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FilterIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ProductMovementLineChart } from "@/components/charts/productMovementLineChart";
import { AutoComplete } from "@/components/Autocomplete";
import { useState } from "react";
import { getDetail, getList } from "@/lib/actions/product.action";
import {QueryClient, QueryClientProvider, useQuery} from "@tanstack/react-query"

export default function Page() {
  const queryClient = new QueryClient()
    const [searchValue, setSearchValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");

  

  // const { data: pokemon, isLoading: isLoadingPokemon } = useQuery({
  //   queryKey: ["pokemon", selectedValue],
  //   queryFn: () => getDetail(selectedValue),
  //   enabled: !!selectedValue,
  // });
  return (
    <div className="flex flex-1 flex-col">
       <div className="flex w-full -ml-2 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Product Movement</h1>
       
      </div>
          <section className="ml-6 mr-6 mt-5 flex justify-between gap-2 max-sm:flex-col sm:items-center bg-white items-center rounded-md p-2">
       {/* <GlobalFilter
         label="Product Name"
          filters={HomePageYear}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        /> */}
        <div className="">
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
          
        </div>
        <GlobalFilter
                 label="Branch"

          filters={HomePageBranchesFilters}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
          <GlobalFilter
                   label="Week"

          filters={HomePageWeek}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
          <GlobalFilter
                   label="Month"
          filters={HomePageMonth}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
         <GlobalFilter
         label="Year"
          filters={HomePageYear}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
        />
         
                  
 <Button
          className="mt-5 primary-gradient h-9 px-4 py-1 !text-light-900 bg-blue-500"
          // asChild
        >
          <FilterIcon/>
          <Link href="/">Apply filter</Link>
        </Button>
        
      </section>
       
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
         
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
             <ProductMovementLineChart/>
            </div>
           


          </div>
        
        </div>
      </div>
    </div>
  );
}
