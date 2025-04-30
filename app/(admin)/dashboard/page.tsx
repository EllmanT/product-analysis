import { ChartAreaInteractive } from "@/components/charts/LineChartInteractive";
import { SectionCards } from "@/components/statistics/StatisticsSection";

// import data from "./data.json";
import { projects, reOrderItems } from "@/app/data";
import { columns } from "@/components/data-table/columns/columns";
import { DataTable } from "@/components/data-table/index";
import DataTableTopHeader from "@/components/data-table/Header";
import { reorderColumns } from "@/components/data-table/columns/columnsReorder";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <SectionCards />
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7">
              <ChartAreaInteractive />
            </div>
            <div className="lg:col-span-5">
            <DataTableTopHeader isVisible={false} label="Reorder Alert" color="bg-amber-600"/>
            <DataTable data={reOrderItems} columns={reorderColumns} isVisible={true}/>
            </div>

          </div>
          <DataTableTopHeader isVisible={false} label="Branch History"/>
      <DataTable data={projects} columns={columns} />
      {/* <DataTable data={projects}/> */}
          {/* <DataTable data={data} /> */}
        </div>
      </div>
    </div>
  );
}
