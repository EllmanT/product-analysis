import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"
import StatisticsCard from "../cards/StatisticsCard"
import { StoreIcon } from "lucide-react"

const intlCount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const intlMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function SectionCards(dashboardStats:any) {
    if (!dashboardStats.dashboardStats) return null; // Or show a loader/spinner

const estStockValue = dashboardStats?.dashboardStats?.estStockValue??0;
  const productCount = dashboardStats.dashboardStats.productCount ?? 0;
  const currentStockQty = dashboardStats.dashboardStats.currentStockQty ?? 0;
  const estSales = dashboardStats.dashboardStats.totalEstimatedSales??0;
  const totalBranches = dashboardStats.dashboardStats.totalBranches??0;
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">
   
     <>
     <StatisticsCard
      label="Products"
      value={intlCount.format(productCount)}
      secondaryLabel="Current stock"
      secondaryValue={intlCount.format(currentStockQty)}
      bgColor="bg-blue-300"
      icon={IconTrendingUp}
      />
     
<StatisticsCard
      label="Estimated Stock Value"
      value={intlMoney.format(estStockValue)}
      trend="-8.5%"
            bgColor="bg-purple-300"

      icon={IconTrendingDown}
      />
        <StatisticsCard
      label="Estimated Sales"
      value={intlMoney.format(estSales)}
      trend="-8.5%"
            bgColor="bg-green-300"

      icon={IconTrendingDown}
      />

      <StatisticsCard
      label="Total Branches"
      value={intlCount.format(totalBranches)}
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
