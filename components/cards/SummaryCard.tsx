import React from 'react'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { IconTrendingUp } from '@tabler/icons-react'

const SummaryCard = () => {
  return (
    <Card className="@container/card">
    <CardHeader>
      <CardDescription>Weekly Summary</CardDescription>
    
      <CardAction>
        <Badge variant="outline">
          <IconTrendingUp />
          +4.5%
        </Badge>
      </CardAction>
    </CardHeader>
    <CardFooter className="flex-col items-start gap-1.5 text-sm">
    <div className="flex justify-between items-center w-full text-muted-foreground">
    <span>Current week</span>
    <span className='font-bold'>2025 April W 2</span>
  </div>
  <div className="flex justify-between items-center w-full text-muted-foreground">
    <span>Last week</span>
    <span className='font-bold'>April 7- April 14</span>
  </div>
  <div className="flex justify-between items-center w-full text-muted-foreground">
    <span>Stores Reported</span>
    <span className='font-bold'>4 of 5</span>
  </div>
 

      
    </CardFooter>
  </Card>
  )
}

export default SummaryCard