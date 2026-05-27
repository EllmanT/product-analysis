"use server"

import { Types } from "mongoose"
import dbConnect from "@/lib/mongoose"
import { Branch, Upload, UploadProduct, User, WeeklyProductSummaries } from "@/database"
import { normalizeRole } from "@/lib/auth/role"
import type { IUser } from "@/database/user.model"

export type DashboardStats = {
  productCount: number
  currentStockQty: number
  estStockValue: number
  totalEstimatedSales: number
  totalBranches: number
  totalUploadFiles: number
  totalStoreUsers: number
}

function toFloat(value: unknown): number {
  if (!value) return 0
  const str = typeof (value as { toString?: () => string }).toString === "function"
    ? (value as { toString: () => string }).toString()
    : String(value)
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

export async function getDashboardStats(user: IUser): Promise<DashboardStats> {
  await dbConnect()

  const objectStoreId = new Types.ObjectId(String(user.storeId))
  const role = normalizeRole(user.role)

  const branchMatch =
    role === "branch_user" && user.branchId
      ? { storeId: objectStoreId, branchId: new Types.ObjectId(String(user.branchId)) }
      : { storeId: objectStoreId }

  // Run all independent aggregations in parallel
  const [
    uploadResultArr,
    weeklyResultArr,
    totalBranchesCount,
    latestUploadAgg,
    totalUploadFiles,
    totalStoreUsers,
  ] = await Promise.all([
    Upload.aggregate([
      { $match: branchMatch },
      { $sort: { branchId: 1, upload_date: -1 } },
      { $group: { _id: "$branchId", estimatedValue: { $first: "$estimatedValue" }, totalProducts: { $first: "$totalProducts" } } },
      { $group: { _id: null, estStockValue: { $sum: "$estimatedValue" }, estStock: { $sum: "$totalProducts" } } },
      { $project: { _id: 0, estStockValue: 1, estStock: 1 } },
    ]),
    WeeklyProductSummaries.aggregate([
      { $match: branchMatch },
      { $project: { estimatedSales: 1, quantitySold: { $subtract: ["$startQuantity", "$endQuantity"] } } },
      { $group: { _id: null, totalEstimatedSales: { $sum: "$estimatedSales" }, totalQuantitySold: { $sum: "$quantitySold" } } },
      { $project: { _id: 0, totalEstimatedSales: 1, totalQuantitySold: 1 } },
    ]),
    role === "branch_user" && user.branchId
      ? Promise.resolve(1)
      : Branch.countDocuments({ storeId: objectStoreId }),
    Upload.aggregate([
      { $match: branchMatch },
      { $sort: { upload_date: -1 } },
      { $group: { _id: "$branchId", latestUploadId: { $first: "$_id" } } },
    ]),
    Upload.countDocuments(branchMatch),
    User.countDocuments({ storeId: objectStoreId }),
  ])

  const latestUploadIds = (latestUploadAgg as Array<{ latestUploadId?: Types.ObjectId }>)
    .map((d) => d.latestUploadId)
    .filter((id): id is Types.ObjectId => !!id)

  let productCount = 0
  let currentStockQty = 0
  if (latestUploadIds.length > 0) {
    const [productAgg] = await UploadProduct.aggregate([
      { $match: { ...branchMatch, uploadId: { $in: latestUploadIds } } },
      { $group: { _id: null, distinctIds: { $addToSet: "$productId" }, totalQty: { $sum: "$qty" } } },
      { $project: { _id: 0, productCount: { $size: "$distinctIds" }, currentStockQty: "$totalQty" } },
    ])
    productCount = productAgg?.productCount ?? 0
    currentStockQty = productAgg?.currentStockQty ?? 0
  }

  return {
    productCount,
    currentStockQty,
    estStockValue: toFloat(uploadResultArr[0]?.estStockValue),
    totalEstimatedSales: toFloat(weeklyResultArr[0]?.totalEstimatedSales),
    totalBranches: typeof totalBranchesCount === "number" ? totalBranchesCount : 0,
    totalUploadFiles,
    totalStoreUsers,
  }
}

export async function getDashboardBranches(user: IUser): Promise<Branch[]> {
  await dbConnect()

  const role = normalizeRole(user.role)

  if (role === "admin") {
    const docs = await Branch.find({ storeId: user.storeId })
      .populate("storeId", "name")
      .lean()
    return JSON.parse(JSON.stringify(docs))
  }

  if (!user.branchId) return []

  const doc = await Branch.findOne({
    _id: user.branchId,
    storeId: user.storeId,
  })
    .populate("storeId", "name")
    .lean()

  return doc ? JSON.parse(JSON.stringify([doc])) : []
}
