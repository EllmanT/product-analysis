"use client"
import { BranchSalesLineChart } from "@/components/charts/BranchSalesLineChart";
import { ChartAreaInteractive } from "@/components/charts/LineChartInteractive";
import { SectionCards } from "@/components/statistics/StatisticsSection";

// import data from "./data.json";
import { Separator } from "@/components/ui/separator";
import React, { useEffect, useState } from "react";

export default function Page() {

  const [branches, setBranches]= useState<Branch[]>([]);
  const [loading , setLoading]= useState(true)
  const [dashboardStats,setDashboardStats]= useState();
      const [chartData, setChartData] = useState<[]>([]);
      const [date, setDate] = React.useState<Date | undefined>(undefined);
      const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);
      
      const selectedBranch = useState("")
  

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        console.log("here")
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");

        const {data} = await res.json();

         const response = await fetch(`/api/analytics/branches?storeId=${data.branches[0].storeId._id}`);
          if (!response.ok) throw new Error("Failed to fetch branches");
  
          const {data:datas} = await response.json();
          setChartData(datas)

        console.log("data", data)
        console.log("data branches", data.branches)
        setBranches(data.branches);
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

       const fetchOverallStats = async () => {
      try {
        console.log("here")
        const res = await fetch("/api/analytics");
        if (!res.ok) throw new Error("Failed to fetch branches");

        const {data} = await res.json();

        console.log("data", data)
        setDashboardStats(data);
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
            fetchBranches();

fetchOverallStats();
  }, []);

  console.log(dashboardStats)

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
      
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">
          <SectionCards dashboardStats={dashboardStats}/>

          </div>
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              {/* <ChartAreaInteractive /> */}

                           <BranchSalesLineChart branch={selectedBranch} startDate={date} endDate={endDate} chartData={chartData}/>
              
            </div>
           


          </div>
           <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* <div className="lg:col-span-12">
      <DataTable data={projects} columns={columns} />

              </div> */}
            </div>
       
        </div>
      </div>
    </div>
  );
}
