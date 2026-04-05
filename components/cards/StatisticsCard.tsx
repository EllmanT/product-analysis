import React from 'react'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { IconTrendingUp } from '@tabler/icons-react'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'

const StatisticsCard = ({
  label,
  value,
  secondaryLabel,
  secondaryValue,
  trend,
  description,
  icon: Icon,
  period,
  bgColor,
}: StatisticsCard) => {
  return (
    <Card className="@container/card">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-xl font-semibold tabular-nums @[250px]/card:text-3xl">
        {value}
      </CardTitle>
      {secondaryLabel != null && secondaryValue != null && (
        <div className="text-muted-foreground mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span>{secondaryLabel}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {secondaryValue}
          </span>
        </div>
      )}
      <CardAction>
        {(Icon || trend) ? (
        <Badge variant="outline" className={cn(`${bgColor}`)}>
          {Icon && <Icon/>}
          {trend}
        </Badge>
        ) : null}
      </CardAction>
    </CardHeader>
    <CardFooter className="flex-col items-start gap-1.5 text-sm">
      <div className="line-clamp-1 flex gap-2 font-medium">
        {description} {period} 
        {/* {Icon && <Icon className="size-4"/>} */}

      </div>
    
    </CardFooter>
  </Card>
  )
}

export default StatisticsCard   