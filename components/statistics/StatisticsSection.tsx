import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"
import StatisticsCard from "../cards/StatisticsCard"
import SummaryCard from "../cards/SummaryCard"

export function SectionCards() {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
     
      <StatisticsCard
      label="Total Products"
      value="5000"
      trend="+12.5%"
      description="Trending up"
      period="this month"
      icon={IconTrendingUp}
      />
       <StatisticsCard
      label="Low Stock Items"
      value="5"
      trend="-8.5%"
      description="Trending up"
      period="this month"
      icon={IconTrendingDown}
      />

<StatisticsCard
      label="Fast Moving Items"
      value="5"
      trend="-8.5%"
      description="Trending up"
      period="this month"
      icon={IconTrendingDown}
      />
   
      <SummaryCard/>
      
    </div>
  )
}
