import { Types } from "mongoose";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";
import {
  Branch,
  Invoice,
  Quotation,
  Upload,
  UploadProduct,
  User,
  WeeklyProductSummaries,
} from "@/database";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import { normalizeRole } from "@/lib/auth/role";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  const storeId = data.user.storeId;
  await dbConnect();

  const objectStoreId = new Types.ObjectId(storeId);
  const role = normalizeRole(data.user.role);
  const branchMatch =
    role === "branch_user" && data.user.branchId
      ? { storeId: objectStoreId, branchId: new Types.ObjectId(data.user.branchId) }
      : { storeId: objectStoreId };

  const [uploadResult] = await Upload.aggregate([
    { $match: branchMatch },
    { $sort: { branchId: 1, upload_date: -1 } },
    {
      $group: {
        _id: "$branchId",
        estimatedValue: { $first: "$estimatedValue" },
        totalProducts: { $first: "$totalProducts" },
      },
    },
    {
      $group: {
        _id: null,
        estStockValue: { $sum: "$estimatedValue" },
        estStock: { $sum: "$totalProducts" },
      },
    },
    { $project: { _id: 0, estStockValue: 1, estStock: 1 } },
  ]);

  const [weeklyResult] = await WeeklyProductSummaries.aggregate([
    { $match: branchMatch },
    {
      $project: {
        estimatedSales: 1,
        quantitySold: { $subtract: ["$startQuantity", "$endQuantity"] },
      },
    },
    {
      $group: {
        _id: null,
        totalEstimatedSales: { $sum: "$estimatedSales" },
        totalQuantitySold: { $sum: "$quantitySold" },
      },
    },
    { $project: { _id: 0, totalEstimatedSales: 1, totalQuantitySold: 1 } },
  ]);

  let totalBranches: number;
  if (role === "branch_user" && data.user.branchId) {
    totalBranches = 1;
  } else {
    totalBranches = await Branch.countDocuments({ storeId: objectStoreId });
  }

  const latestUploadAgg = await Upload.aggregate([
    { $match: branchMatch },
    { $sort: { upload_date: -1 } },
    { $group: { _id: "$branchId", latestUploadId: { $first: "$_id" } } },
  ]);
  const latestUploadIds = latestUploadAgg
    .map((d) => d.latestUploadId as Types.ObjectId | undefined)
    .filter((id): id is Types.ObjectId => !!id);

  let productCount = 0;
  let currentStockQty = 0;
  if (latestUploadIds.length > 0) {
    const productMatch = {
      ...branchMatch,
      uploadId: { $in: latestUploadIds },
    };
    const [productAgg] = await UploadProduct.aggregate([
      { $match: productMatch },
      {
        $group: {
          _id: null,
          distinctIds: { $addToSet: "$productId" },
          totalQty: { $sum: "$qty" },
        },
      },
      {
        $project: {
          _id: 0,
          productCount: { $size: "$distinctIds" },
          currentStockQty: "$totalQty",
        },
      },
    ]);
    productCount = productAgg?.productCount ?? 0;
    currentStockQty = productAgg?.currentStockQty ?? 0;
  }

  const [totalQuotations, totalInvoices, totalUploadFiles, totalStoreUsers] =
    await Promise.all([
      Quotation.countDocuments({}),
      Invoice.countDocuments({}),
      Upload.countDocuments(branchMatch),
      User.countDocuments({ storeId: objectStoreId }),
    ]);

  function toFloat(value: unknown) {
    return value && typeof (value as { toString?: () => string }).toString === "function"
      ? parseFloat((value as { toString: () => string }).toString())
      : 0;
  }

  const combined = {
    estStockValue: toFloat(uploadResult?.estStockValue),
    estStock: uploadResult?.estStock ?? 0,
    productCount,
    currentStockQty,
    totalEstimatedSales: toFloat(weeklyResult?.totalEstimatedSales),
    totalQuantitySold: weeklyResult?.totalQuantitySold ?? 0,
    totalBranches,
    totalQuotations,
    totalInvoices,
    totalUploadFiles,
    totalStoreUsers,
  };

  return NextResponse.json({ success: true, data: combined }, { status: 200 });
}
