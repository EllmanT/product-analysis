"use client"

import { Button } from "@/components/ui/button";
import { FilterIcon, StoreIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import React, { startTransition, useEffect, useState } from "react";
import DownloadCenterCard from "@/components/cards/DownloadCenterCard";
import {  downloadExportAll, downloadExportBranch } from "@/app/api/products/downloadexcel";
import { Calendar22 } from "@/components/Calendat";
import BranchFilter from "@/components/filter/BranchFilter";
import { getUser } from "@/lib/actions/user.action";

export default function Page() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId]= useState("");

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



  useEffect(() => {
    const fetchBranches = async () => {
      try {
        console.log("here")
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");

        const {data} = await res.json();
        setBranches(data.branches);
        setStoreId(data.branches[0].storeId._id)
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
  }, []);

          console.log("branches",branches)
          console.log("storeId",storeId)

  if (loading) return <div>Loading branches...</div>;


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
   
        <Calendar22 label={"From"}  onDateChange={handleStartDateChange}/>
        <Calendar22 label={"To"}  onDateChange={handleEndDateChange}/>
        <BranchFilter
                 label="Branch"

          filters={branches}
          // otherClasses="min-h-[56px] sm:min-w-[170px]"
          containerClasses="  max-md:flex"
          queryKey="branch"
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
