import React from 'react'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { IconTrendingUp } from '@tabler/icons-react'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'

const UploadDetailsCard = ({label, value,trend,description,icon:Icon,period, bgColor}: StatisticsCard) => {
  return (
    <Card className="@container/card">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-xl font-semibold tabular-nums @[250px]/card:text-3xl">
        {value}
      </CardTitle>
      <CardAction>
        <Badge variant="outline" className={cn(`${bgColor}`)}>
          {Icon && <Icon/>}
          {trend}
        </Badge>
      </CardAction>
    </CardHeader>
    
  </Card>
  )
}

export default UploadDetailsCard   