"use client"
import { BranchSalesLineChart } from "@/components/charts/BranchSalesLineChart";
import { SectionCards } from "@/components/statistics/StatisticsSection";

import { Separator } from "@/components/ui/separator";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Receipt, Upload, Users } from "lucide-react";

type DashboardAnalytics = {
  productCount?: number;
  currentStockQty?: number;
  estStockValue?: number;
  totalEstimatedSales?: number;
  totalBranches?: number;
  totalQuotations?: number;
  totalInvoices?: number;
  totalUploadFiles?: number;
  totalStoreUsers?: number;
};

const countFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export default function Page() {

  const [branches, setBranches]= useState<Branch[]>([]);
  const [loading , setLoading]= useState(true)
  const [dashboardStats,setDashboardStats]= useState<DashboardAnalytics>();
      const [chartData, setChartData] = useState<[]>([]);
      const [date, setDate] = React.useState<Date | undefined>(undefined);
      const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);
      
      const [selectedBranch] = useState<Branch | undefined>(undefined)
  

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");

        const {data} = await res.json();

         const response = await fetch(`/api/analytics/branches?storeId=${data.branches[0].storeId._id}`);
          if (!response.ok) throw new Error("Failed to fetch branches");
  
          const {data:datas} = await response.json();
          setChartData(datas)

        setBranches(data.branches);
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

       const fetchOverallStats = async () => {
      try {
        const res = await fetch("/api/analytics");
        if (!res.ok) throw new Error("Failed to fetch analytics");

        const {data} = await res.json();

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

          <div className="px-4 lg:px-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  {
                    label: "Quotations",
                    href: "/admin/quotations",
                    icon: FileText,
                    desc: "View & manage customer quotes",
                    color: "bg-blue-100 text-blue-600",
                    count: dashboardStats?.totalQuotations ?? 0,
                  },
                  {
                    label: "Invoices",
                    href: "/admin/invoices",
                    icon: Receipt,
                    desc: "Track invoices & payments",
                    color: "bg-indigo-100 text-indigo-600",
                    count: dashboardStats?.totalInvoices ?? 0,
                  },
                  {
                    label: "Upload",
                    href: "/uploads/upload",
                    icon: Upload,
                    desc: "Upload product data files",
                    color: "bg-emerald-100 text-emerald-600",
                    count: dashboardStats?.totalUploadFiles ?? 0,
                  },
                  {
                    label: "Users",
                    href: "/users",
                    icon: Users,
                    desc: "Manage staff accounts",
                    color: "bg-slate-100 text-slate-600",
                    count: dashboardStats?.totalStoreUsers ?? 0,
                  },
                ] as const
              ).map(({ label, href, icon: Icon, desc, color, count }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-right text-2xl font-semibold tabular-nums text-slate-900">
                      {countFormatter.format(count)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
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
