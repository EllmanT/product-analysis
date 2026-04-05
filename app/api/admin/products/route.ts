import { PipelineStage, Types } from "mongoose";
import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import { UploadProduct } from "@/database";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  await dbConnect();

  const { searchParams } = req.nextUrl;
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10));
  const search   = (searchParams.get("search") ?? "").trim();
  const filter   = searchParams.get("filter") ?? "all";

  const objectStoreId = new Types.ObjectId(String(data.user.storeId));

  // For "highvalue" filter we need the 75th-percentile price up front
  let p75Price = 0;
  if (filter === "highvalue") {
    const priceAgg = await UploadProduct.aggregate([
      { $match: { storeId: objectStoreId } },
      { $sort: { upload_date: -1 } },
      { $group: { _id: { productId: "$productId", branchId: "$branchId" }, price: { $first: "$price" } } },
      { $group: { _id: null, prices: { $push: { $toDouble: "$price" } } } },
    ]);
    const prices: number[] = (priceAgg[0]?.prices ?? []).sort((a: number, b: number) => a - b);
    const idx = Math.floor(prices.length * 0.75);
    p75Price = prices[idx] ?? 0;
  }

  // Base pipeline: most-recent UploadProduct per (product, branch), grouped per product
  const basePipeline: PipelineStage[] = [
    { $match: { storeId: objectStoreId } },
    { $sort: { upload_date: -1 } },
    // Most-recent record per (productId, branchId)
    {
      $group: {
        _id: { productId: "$productId", branchId: "$branchId" },
        qty: { $first: "$qty" },
        price: { $first: "$price" },
        productId: { $first: "$productId" },
        lastUploadDate: { $first: "$upload_date" },
      },
    },
    // Aggregate across branches for this store (sum qty, keep highest price as display price)
    {
      $group: {
        _id: "$productId",
        totalQty: { $sum: "$qty" },
        price: { $first: "$price" },
        lastUploadDate: { $max: "$lastUploadDate" },
      },
    },
    // Join ProductMaster for name + standardCode
    {
      $lookup: {
        from: "productmasters",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: false } },
  ];

  const activityStage: PipelineStage[] =
    filter === "inactive"
      ? [{ $match: { "product.isActive": false } }]
      : [
          {
            $match: {
              $or: [
                { "product.isActive": true },
                { "product.isActive": { $exists: false } },
              ],
            },
          },
        ];

  const afterActivityPipeline: PipelineStage[] = [
    // Computed fields
    {
      $addFields: {
        stockValue: { $multiply: ["$totalQty", { $toDouble: "$price" }] },
        priceDouble: { $toDouble: "$price" },
        status: {
          $switch: {
            branches: [
              { case: { $eq: ["$totalQty", 0] }, then: "Dead Stock" },
              { case: { $and: [{ $gt: ["$totalQty", 0] }, { $lt: ["$totalQty", 10] }] }, then: "Low Stock" },
            ],
            default: "In Stock",
          },
        },
      },
    },
  ];

  const baseThroughActivity = [
    ...basePipeline,
    ...activityStage,
    ...afterActivityPipeline,
  ];

  // Search filter
  const searchStage: PipelineStage[] = [];
  if (search) {
    if (search.startsWith(">")) {
      const val = parseFloat(search.slice(1));
      if (!isNaN(val)) searchStage.push({ $match: { priceDouble: { $gt: val } } });
    } else if (search.startsWith("<")) {
      const val = parseFloat(search.slice(1));
      if (!isNaN(val)) searchStage.push({ $match: { priceDouble: { $lt: val } } });
    } else {
      searchStage.push({
        $match: {
          $or: [
            { "product.name": { $regex: search, $options: "i" } },
            { "product.standardCode": { $regex: search, $options: "i" } },
          ],
        },
      });
    }
  }

  // Tab filter
  const filterStage: PipelineStage[] = [];
  if (filter === "instock") {
    filterStage.push({ $match: { totalQty: { $gt: 0 } } });
  } else if (filter === "deadstock") {
    filterStage.push({ $match: { totalQty: 0 } });
  } else if (filter === "lowstock") {
    filterStage.push({ $match: { totalQty: { $gt: 0, $lt: 10 } } });
  } else if (filter === "highvalue") {
    filterStage.push({ $match: { priceDouble: { $gt: p75Price } } });
  }

  const fullPipeline = [...baseThroughActivity, ...searchStage, ...filterStage];

  // Count total matching records
  const countPipeline = [...fullPipeline, { $count: "total" }];
  const [countResult] = await UploadProduct.aggregate(countPipeline);
  const total = countResult?.total ?? 0;

  // Paginated results
  const dataPipeline: PipelineStage[] = [
    ...fullPipeline,
    { $sort: { "product.name": 1 } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    {
      $project: {
        _id: 1,
        totalQty: 1,
        price: { $toDouble: "$price" },
        lastUploadDate: 1,
        stockValue: 1,
        status: 1,
        name: "$product.name",
        standardCode: "$product.standardCode",
        isActive: { $ifNull: ["$product.isActive", true] },
      },
    },
  ];

  const products = await UploadProduct.aggregate(dataPipeline);

  return NextResponse.json(
    {
      success: true,
      data: {
        products,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    },
    { status: 200 }
  );
}
