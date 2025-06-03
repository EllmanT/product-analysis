import React, { startTransition } from 'react'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { IconTrendingUp } from '@tabler/icons-react'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { DownloadIcon } from 'lucide-react'
import { api } from '@/lib/api'

const DownloadCenterCard = ({label, value,trend,description,icon:Icon,period, bgColor}: StatisticsCard) => {
  

  const handleDownload = async () => {
   
    // startTransition(async () => {
    //   const { success, data: responseData, error } = await api.products.export;
  
    //   if (success) {
    //     console.log("Upload successful:", responseData);
    //     // Maybe show toast or redirect
    //   } else {
    //     console.error("Upload failed:", error);
    //     // Show error to user
    //   }
    // });
  };
  return (
    <Card className="@container/card">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className=" text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
       <Button onClick={handleDownload} variant="outline" className='bg-green-700'><DownloadIcon/> Download {label}</Button>
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