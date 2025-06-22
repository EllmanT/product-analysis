"use client"
// import data from "./data.json";
import GlobalFilter from "@/components/filter/GlobalFilter";
import { HomePageBranchesFilters,  HomePageMonth, HomePageWeek, HomePageYear } from "@/constants/filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FilterIcon, RefreshCcw } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ProductMovementLineChart } from "@/components/charts/productMovementLineChart";
import { AutoComplete } from "@/components/Autocomplete";
import React, { startTransition, useEffect, useMemo, useState } from "react";
import { getDetail, getList } from "@/lib/actions/product.action";
import {QueryClient, QueryClientProvider, useQuery} from "@tanstack/react-query"
import { BranchSalesLineChart } from "@/components/charts/BranchSalesLineChart";
import { downloadExportAll, downloadExportBranch } from "@/app/api/products/downloadexcel";
import BranchFilter from "@/components/filter/BranchFilter";
import { Calendar22 } from "@/components/Calendat";
import { useSearchParams } from "next/navigation";

export default  function Page() {
  const queryClient = new QueryClient()
    const [searchValue, setSearchValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");

    const [branches, setBranches] = useState<Branch[]>([]);
    const [chartData, setChartData] = useState<[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId]= useState("");
  

const [date, setDate] = React.useState<Date | undefined>(undefined);
const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);
  const handleStartDateChange = (date: Date) => {
    console.log("Selected Date:", date)
    setDate(date)
  }
    const handleEndDateChange = (enddate: Date) => {
    console.log("Selected Date:", enddate)
    setEndDate(enddate)
  }
  const handleApplyFilter = (e: React.MouseEvent<HTMLButtonElement>) => {
     e.preventDefault()
    const params = new URLSearchParams(window.location.search);
    const branch = params.get("branch")
  
    console.log(date)
    if (!date || !endDate) {
      console.warn("❗ Missing filter values (month/week/year)");
      return;
    }
  
    startTransition(async () => {
          if(!branch || branch==="all"){
         try {
       
      await downloadExportAll(date, endDate, storeId);
      console.log("✅ Export all branches triggered successfully");
      // Optional: show toast or notification
    } catch (err) {
      console.error("❌ Export all branches failed:", err);
      // Optional: show error toast
    }
      }else{
        try {
  
          console.log(date)
          console.log(endDate)
      await downloadExportBranch(date, endDate, branch);
      console.log(`✅ Export ${branch} triggered successfully`);
      // Optional: show toast or notification
    } catch (err) {
      console.error(`❌ Export  ${branch} failed:`, err);
      // Optional: show error toast
    }
      }
   
    });
  };
  
  const handleResetFilters=()=>{
     window.location.reload()
  } 

  
    useEffect(() => {
      const fetchBranches = async () => {
        try {
          console.log("here")
          const res = await fetch("/api/branches");
          if (!res.ok) throw new Error("Failed to fetch branches");
  
          const {data} = await res.json();
          setBranches(data.branches);
          setStoreId(data.branches[0].storeId._id)
          
        const response = await fetch(`/api/analytics/branches?storeId=${data.branches[0].storeId._id}`);
          if (!response.ok) throw new Error("Failed to fetch branches");
  
          const {data:datas} = await response.json();
          setChartData(datas)
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
  
      fetchBranches();
    }, []);
  
            console.log("datas",chartData)

  
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branch')

  const selectedBranch = useMemo(() => {
    return branches.find(branch => branch._id === branchId)
  }, [branchId, branches])

  useEffect(() => {
    if (selectedBranch) {
      console.log("Selected Branch Name:", selectedBranch.name)
      console.log("Selected Branch Location:", selectedBranch.location)
    }
  }, [selectedBranch])

      if (loading) return <div>Loading branches...</div>;

  return (
    <div className="flex flex-1 flex-col">
       <div className="flex w-full -ml-2 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Branch Analytics</h1>
       
      </div>
     <section className="ml-6 mr-4 mt-5 flex justify-between gap-1 max-sm:flex-col sm:items-center bg-white items-center rounded-md p-2">
            <div className="flex space-x-1">
                <Calendar22 label={"From"}  onDateChange={handleStartDateChange}/>
                <Calendar22 label={"To"}  onDateChange={handleEndDateChange}/>
        
            </div>
           
            
                <BranchFilter
                         label="Branch"
        
                  filters={branches}
                  // otherClasses="min-h-[56px] sm:min-w-[170px]"
                  containerClasses="  max-md:flex"
                  queryKey="branch"
                />
        
                 <div className="space-x-1">
                   <Button
                  className="mt-5 primary-gradient h-9 px-4 py-1 !text-light-900 bg-blue-500"
                  // asChild
                  onClick={handleApplyFilter}
                >
                  <FilterIcon/>
               Filter
                </Button>
                                  
         <Button
                  className="mt-5 primary-gradient h-9 py-1 !text-light-900 bg-orange-500"
                  // asChild
                  onClick={handleResetFilters}
                >
                  <RefreshCcw/>
               Filter
                </Button>
                  </div>        
        
              </section>
       
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
         
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
             <BranchSalesLineChart branch={selectedBranch} startDate={date} endDate={endDate} chartData={chartData}/>
            </div>
           


          </div>
        
        </div>
      </div>
    </div>
  );
}
