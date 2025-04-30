import React from 'react'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { IconTrendingUp } from '@tabler/icons-react'
import { Badge } from '../ui/badge'

const StatisticsCard = ({label, value,trend,description,icon:Icon,period}: StatisticsCard) => {
  return (
    <Card className="@container/card">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
        {value}
      </CardTitle>
      <CardAction>
        <Badge variant="outline">
          {Icon && <Icon/>}
          {trend}
        </Badge>
      </CardAction>
    </CardHeader>
    <CardFooter className="flex-col items-start gap-1.5 text-sm">
      <div className="line-clamp-1 flex gap-2 font-medium">
        {description} {period} 
        {Icon && <Icon className="size-4"/>}

      </div>
    
    </CardFooter>
  </Card>
  )
}

export default StatisticsCard   