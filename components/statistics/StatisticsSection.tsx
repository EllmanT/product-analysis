import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"
import StatisticsCard from "../cards/StatisticsCard"
import SummaryCard from "../cards/SummaryCard"
import { StoreIcon } from "lucide-react"

export function SectionCards(dashboardStats:any) {
  console.log(dashboardStats)
    if (!dashboardStats.dashboardStats) return null; // Or show a loader/spinner

const estStockValue = dashboardStats?.dashboardStats?.estStockValue??0;
  const estStock = dashboardStats.dashboardStats.estStock??0;
  const estSales = dashboardStats.dashboardStats.totalEstimatedSales??0;
  const totalBranches = dashboardStats.dashboardStats.totalBranches??0;
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">
   
     <>
     <StatisticsCard
      label="Current Stock"
      value={estStock}
      trend="+12.5%"
      bgColor="bg-blue-300"
      icon={IconTrendingUp}
      />
     
<StatisticsCard
      label="Estimated Stock Value"
      value={`$ ${estStockValue}`}
      trend="-8.5%"
            bgColor="bg-purple-300"

      icon={IconTrendingDown}
      />
        <StatisticsCard
      label="Estimated Sales"
      value={`$ ${estSales}`}
      trend="-8.5%"
            bgColor="bg-green-300"

      icon={IconTrendingDown}
      />

      <StatisticsCard
      label="Total Branches"
      value={totalBranches}
          bgColor="bg-orange-300"

      description=""
      period=""
      icon={StoreIcon}
      />
     </>
    
      
   
      {/* <SummaryCard/> */}
      
    </div>
  )
}
