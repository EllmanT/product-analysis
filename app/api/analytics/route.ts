import mongoose, { Types } from 'mongoose'
import { startOfISOWeek, addWeeks, format } from 'date-fns'
import dbConnect from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { Branch, Upload, WeeklyProductSummaries } from '@/database'
import { auth } from '@/auth'
import { getUser } from '@/lib/actions/user.action'

export async function GET(req: NextRequest) {
 const session = await auth();
console.log("her now 22")
  if (!session?.user?.id) {
    // return res.status(401).json({ message: "Unauthorized" });
   return NextResponse.json({success:false,},{status:404})

  }
console.log("her now 23")

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    // return res.status(404).json({ message: "User or store not found" });
       return NextResponse.json({success:false,},{status:404})

  }

const storeId = data.user.storeId
 await dbConnect()


const objectStoreId = new Types.ObjectId(storeId)
const [uploadResult] = await Upload.aggregate([
  { $match: { storeId: objectStoreId } },
  { $sort: { branchId: 1, upload_date: -1 } },
  {
    $group: {
      _id: '$branchId',
      estimatedValue: { $first: '$estimatedValue' },
      totalProducts: { $first: '$totalProducts' }
    }
  },
  {
    $group: {
      _id: null,
      estStockValue: { $sum: '$estimatedValue' },
      estStock: { $sum: '$totalProducts' }
    }
  },
  { $project: { _id: 0, estStockValue: 1, estStock: 1 } }
]);

const [weeklyResult] = await WeeklyProductSummaries.aggregate([
  { $match: { storeId: objectStoreId } },
  {
    $project: {
      estimatedSales: 1,
      quantitySold: { $subtract: ['$startQuantity', '$endQuantity'] }
    }
  },
  {
    $group: {
      _id: null,
      totalEstimatedSales: { $sum: '$estimatedSales' },
      totalQuantitySold: { $sum: '$quantitySold' }
    }
  },
  { $project: { _id: 0, totalEstimatedSales: 1, totalQuantitySold: 1 } }
]);

const totalBranches = await Branch.countDocuments({storeId:objectStoreId})

function toFloat(value: any) {
  return value && typeof value.toString === 'function'
    ? parseFloat(value.toString())
    : 0;
}

const combined = {
  estStockValue: toFloat(uploadResult?.estStockValue),
  estStock: uploadResult?.estStock ?? 0,
  totalEstimatedSales: toFloat(weeklyResult?.totalEstimatedSales),
  totalQuantitySold: weeklyResult?.totalQuantitySold ?? 0,
  totalBranches:totalBranches
};


console.log(combined);

//   res.status(200).json(chartData)
     return NextResponse.json({success:true, data:combined},{status:200})
  
}
