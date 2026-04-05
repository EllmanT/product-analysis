import { ProductMaster } from "@/database";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  price_asc: { "latest.price": 1 },
  price_desc: { "latest.price": -1 },
  qty_desc: { "latest.qty": -1 },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSizeRaw = parseInt(
      searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE),
      10
    );
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.isNaN(pageSizeRaw) ? DEFAULT_PAGE_SIZE : pageSizeRaw)
    );
    const q = searchParams.get("search")?.trim() || "";
    const minPrice = parseFloat(searchParams.get("minPrice") || "");
    const maxPrice = parseFloat(searchParams.get("maxPrice") || "");
    const minQty = parseInt(searchParams.get("minQty") || "", 10);
    const sortKey = searchParams.get("sort") || "name_asc";
    const sortObj = SORT_MAP[sortKey] ?? SORT_MAP.name_asc;

    const activeMatch: PipelineStage = {
      $match: {
        $or: [{ isActive: true }, { isActive: { $exists: false } }],
      },
    };

    const searchStages: PipelineStage[] =
      q.length > 0
        ? [
            {
              $match: {
                $or: [
                  { name: { $regex: escapeRegex(q), $options: "i" } },
                  {
                    standardCode: {
                      $regex: escapeRegex(q),
                      $options: "i",
                    },
                  },
                ],
              },
            },
          ]
        : [];

    const lookupAndStock: PipelineStage[] = [
      {
        $lookup: {
          from: "uploadproducts",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$productId", "$$pid"] },
              },
            },
            { $sort: { upload_date: -1, createdAt: -1 } },
            { $limit: 1 },
            { $project: { qty: 1, price: 1 } },
          ],
          as: "latest",
        },
      },
      {
        $unwind: {
          path: "$latest",
          preserveNullAndEmptyArrays: false,
        },
      },
      { $match: { "latest.qty": { $gt: 0 } } },
    ];

    // Optional post-lookup filters
    const postFilters: Record<string, unknown> = {};
    if (!isNaN(minPrice)) postFilters["latest.price"] = { $gte: minPrice };
    if (!isNaN(maxPrice)) {
      postFilters["latest.price"] = {
        ...(postFilters["latest.price"] as Record<string, unknown> ?? {}),
        $lte: maxPrice,
      };
    }
    if (!isNaN(minQty)) postFilters["latest.qty"] = { $gte: minQty };
    const postFilterStages: PipelineStage[] =
      Object.keys(postFilters).length > 0
        ? [{ $match: postFilters } as PipelineStage]
        : [];

    const preFacet: PipelineStage[] = [
      activeMatch,
      ...searchStages,
      ...lookupAndStock,
      ...postFilterStages,
    ];

    const facetStage: PipelineStage = {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $sort: sortObj },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          {
            $project: {
              _id: 1,
              name: 1,
              standardCode: 1,
              imageUrl: 1,
              quantityAvailable: "$latest.qty",
              price: { $toString: "$latest.price" },
            },
          },
        ],
      },
    };

    const [row] = await ProductMaster.aggregate([
      ...preFacet,
      facetStage,
    ]);

    const total = row?.metadata?.[0]?.total ?? 0;
    const rawProducts = row?.data ?? [];

    const products = rawProducts.map(
      (p: {
        _id: unknown;
        name: string;
        standardCode: string;
        imageUrl?: string | null;
        quantityAvailable: number;
        price: string;
      }) => ({
        _id: String(p._id),
        name: p.name,
        standardCode: p.standardCode,
        imageUrl: p.imageUrl ?? null,
        quantityAvailable: p.quantityAvailable,
        price: p.price && p.price.length > 0 ? p.price : null,
      })
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          products,
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
