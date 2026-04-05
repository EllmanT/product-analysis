import { Types } from "mongoose";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";
import { UploadProduct } from "@/database";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  await dbConnect();

  const objectStoreId = new Types.ObjectId(String(data.user.storeId));

  // Single aggregation:
  // 1. Get the most recent UploadProduct per (product, branch) for the store
  // 2. Compute all four summary metrics in one pass
  const [result] = await UploadProduct.aggregate([
    { $match: { storeId: objectStoreId } },
    { $sort: { upload_date: -1 } },
    // Most-recent record per (productId, branchId)
    {
      $group: {
        _id: { productId: "$productId", branchId: "$branchId" },
        qty: { $first: "$qty" },
        price: { $first: "$price" },
        productId: { $first: "$productId" },
      },
    },
    // Roll up across branches into store-level totals
    {
      $group: {
        _id: null,
        productIds: { $addToSet: "$productId" },
        totalUnits: { $sum: "$qty" },
        totalValue: {
          $sum: {
            $multiply: ["$qty", { $toDouble: "$price" }],
          },
        },
        deadStock: {
          $sum: { $cond: [{ $eq: ["$qty", 0] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalProducts: { $size: "$productIds" },
        totalUnits: 1,
        totalValue: 1,
        deadStock: 1,
      },
    },
  ]);

  return NextResponse.json(
    {
      success: true,
      data: {
        totalProducts: result?.totalProducts ?? 0,
        totalUnits: result?.totalUnits ?? 0,
        totalValue: result?.totalValue ?? 0,
        deadStock: result?.deadStock ?? 0,
      },
    },
    { status: 200 }
  );
}
