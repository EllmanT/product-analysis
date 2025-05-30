import React from 'react'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { IconTrendingUp } from '@tabler/icons-react'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { DownloadIcon } from 'lucide-react'

const DownloadCenterCard = ({label, value,trend,description,icon:Icon,period, bgColor}: StatisticsCard) => {
  return (
    <Card className="@container/card">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className=" text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
       <Button variant="outline" className='bg-green-700'><DownloadIcon/> Download {label}</Button>
      </CardTitle>
      <CardAction>
        <Badge variant="outline" className={cn(`${bgColor}`)}>
          {Icon && <Icon/>}
          {trend}
        </Badge>
      </CardAction>
    </CardHeader>
    <CardFooter className="flex-col items-start gap-1.5 text-sm">
      <div className="line-clamp-1 flex gap-2 ">
        {description} {period} 
        {/* {Icon && <Icon className="size-4"/>} */}

      </div>
    
    </CardFooter>
  </Card>
  )
}

export default DownloadCenterCard   