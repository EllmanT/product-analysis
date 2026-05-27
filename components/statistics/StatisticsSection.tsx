import { IconTrendingUp } from "@tabler/icons-react"
import { StoreIcon } from "lucide-react"
import StatisticsCard from "../cards/StatisticsCard"
import type { DashboardStats } from "@/lib/actions/analytics.action"

const intlCount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const intlMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  stats: DashboardStats
}

export function SectionCards({ stats }: Props) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">
      <StatisticsCard
        label="Products"
        value={intlCount.format(stats.productCount)}
        secondaryLabel="Current stock qty"
        secondaryValue={intlCount.format(stats.currentStockQty)}
        bgColor="bg-blue-300"
        icon={IconTrendingUp}
        testId="stat-product-count"
      />

      <StatisticsCard
        label="Estimated Stock Value"
        value={intlMoney.format(stats.estStockValue)}
        bgColor="bg-purple-300"
        icon={IconTrendingUp}
        testId="stat-stock-value"
      />

      <StatisticsCard
        label="Estimated Sales"
        value={intlMoney.format(stats.totalEstimatedSales)}
        bgColor="bg-green-300"
        icon={IconTrendingUp}
        testId="stat-estimated-sales"
      />

      <StatisticsCard
        label="Total Branches"
        value={intlCount.format(stats.totalBranches)}
        bgColor="bg-orange-300"
        icon={StoreIcon}
        testId="stat-branches"
      />
    </div>
  )
}
