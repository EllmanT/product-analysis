import { ProductMaster } from "@/database";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import { escapeRegex } from "@/lib/shop/catalogHelpers";
import {
  projectShopProductCardStage,
  shopCatalogBaseStages,
  stockLookupWithPositiveQtyStages,
} from "@/lib/shop/shopProductPipeline";
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

    const lookupAndStock = stockLookupWithPositiveQtyStages();

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
      ...shopCatalogBaseStages(),
      ...searchStages,
      ...lookupAndStock,
      ...postFilterStages,
    ];

    const facetStage = {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $sort: sortObj },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          projectShopProductCardStage(),
        ],
      },
    } as unknown as PipelineStage;

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
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
          "CDN-Cache-Control": "public, s-maxage=300",
        },
      }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
