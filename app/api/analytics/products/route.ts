import mongoose, { Types } from 'mongoose'
import { startOfISOWeek, addWeeks, format } from 'date-fns'
import dbConnect from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { WeeklyProductSummaries } from '@/database'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
  // const year = searchParams.get("year");

  const storeId = searchParams.get("storeId");
  const productId = searchParams.get("productId");

  if(!storeId){
    return NextResponse.json("Failed to get store",{status:404})
  }

    if(!productId){
    return NextResponse.json("Failed to get product",{status:404})
  }
  console.log("storeId",storeId)
  console.log("productId",productId)
 await dbConnect()


const oneYearAgo = new Date()
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1) // Go back one year


console.log("Filtering summaries from:", oneYearAgo)
const objectStoreId = new Types.ObjectId(storeId)
const objectProductId = new Types.ObjectId(productId)
const summaries = await WeeklyProductSummaries.aggregate([
     {
      $match: {
        upload_date: { $gte: oneYearAgo },
        storeId:objectStoreId,
        productId:objectProductId,
      }
    },
    {
      $lookup: {
        from: 'branches',
        localField: 'branchId',
        foreignField: '_id',
        as: 'branch'
      }
    },
     {
      $unwind: '$branch'
    },
     {
      $lookup: {
        from: 'productmasters',
        localField: 'productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    {
      $unwind: '$product'
    },
    {
      $group: {
        _id: {
          year: '$year',
          week: '$week',
          branch: '$branch.location',
          product:'$product.name'
        },
        totalEstimatedSales: { $sum: '$estimatedSales' }
      }
    }
])

  console.log("summaries",summaries)
  // Reshape to chart-friendly format
  const grouped: Record<string, Record<string, number>> = {}

  for (const item of summaries) {
    const { year, week, branch } = item._id
    const weekStart = startOfISOWeek(new Date(year, 0, 1))
    const actualDate = addWeeks(weekStart, week - 1)
    const dateStr = format(actualDate, 'yyyy-MM-dd')

    if (!grouped[dateStr]) grouped[dateStr] = {}
    grouped[dateStr][branch] = parseFloat(item.totalEstimatedSales)
  }

  const chartData = Object.entries(grouped).map(([date, branches]) => ({
    date,
    ...branches
  }))

  console.log("chartData")
  // Sort ascending by date string (ISO format sorts lexically)
chartData.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))

  console.log("chart data", chartData)

//   res.status(200).json(chartData)
     return NextResponse.json({success:true,data:chartData},{status:200})
  
}
