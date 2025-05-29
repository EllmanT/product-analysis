import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"
import StatisticsCard from "../cards/StatisticsCard"
import SummaryCard from "../cards/SummaryCard"
import { StoreIcon } from "lucide-react"

export function SectionCards() {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">
     
      <StatisticsCard
      label="Total Products"
      value="5000"
      trend="+12.5%"
      bgColor="bg-blue-300"
      icon={IconTrendingUp}
      />
       <StatisticsCard
      label="Estimated Sales"
      value="655K"
      trend="-8.5%"
            bgColor="bg-green-300"

      icon={IconTrendingDown}
      />

<StatisticsCard
      label="Estimated Stock Value"
      value="1.5M"
      trend="-8.5%"
            bgColor="bg-purple-300"

      icon={IconTrendingDown}
      />
      <StatisticsCard
      label="Total Branches"
      value="6"
          bgColor="bg-orange-300"

      description=""
      period=""
      icon={StoreIcon}
      />
   
      {/* <SummaryCard/> */}
      
    </div>
  )
}
