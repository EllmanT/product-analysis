import { HomepageConfig, ProductMaster, ShopPublicStats } from "@/database";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import type { ShopHomepageBrowseTile } from "@/types/shop-homepage";
import { NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";

const STATS_KEY = "default";

/** Match ProductCard placeholder for API fallbacks (avoid importing client module). */
const PLACEHOLDER_IMAGE =
  "https://placehold.co/400x300?text=Product";

/** Colorful category thumbnails (Unsplash — `images.unsplash.com` in next.config). */
const BROWSE_TILE_QUERIES: {
  label: string;
  searchQuery: string;
  imageUrl: string;
}[] = [
  {
    label: "Cables",
    searchQuery: "cable",
    imageUrl:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "LED Lights",
    searchQuery: "LED",
    imageUrl:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "Solar Panels",
    searchQuery: "solar",
    imageUrl:
      "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "Pumps",
    searchQuery: "pump",
    imageUrl:
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "Tools",
    searchQuery: "tool",
    imageUrl:
      "https://images.unsplash.com/photo-1581147036324-c4a87c6e628a?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "Breakers",
    searchQuery: "breaker",
    imageUrl:
      "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "Conduits",
    searchQuery: "conduit",
    imageUrl:
      "https://images.unsplash.com/photo-1584622788857-29c4acd0ead0?auto=format&fit=crop&w=256&h=256&q=80",
  },
  {
    label: "Safety",
    searchQuery: "safety",
    imageUrl:
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=256&h=256&q=80",
  },
];

type ProductRow = {
  _id: string;
  name: string;
  standardCode: string;
  imageUrl: string | null;
  quantityAvailable: number;
  price: string | null;
};

/** Shared $lookup pipeline to get latest qty/price for each product */
const latestLookup: PipelineStage[] = [
  {
    $lookup: {
      from: "uploadproducts",
      let: { pid: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$productId", "$$pid"] } } },
        { $sort: { upload_date: -1, createdAt: -1 } },
        { $limit: 1 },
        { $project: { qty: 1, price: 1 } },
      ],
      as: "latest",
    },
  },
  { $unwind: { path: "$latest", preserveNullAndEmptyArrays: false } },
  { $match: { "latest.qty": { $gt: 0 } } },
];

const projectStage: PipelineStage = {
  $project: {
    _id: 1,
    name: 1,
    standardCode: 1,
    imageUrl: 1,
    quantityAvailable: "$latest.qty",
    price: { $toString: "$latest.price" },
  },
};

const activeMatch: PipelineStage = {
  $match: { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
};

function normalise(raw: Record<string, unknown>[]): ProductRow[] {
  return raw.map((p) => ({
    _id: String(p._id),
    name: p.name as string,
    standardCode: p.standardCode as string,
    imageUrl: (p.imageUrl as string | null | undefined) ?? null,
    quantityAvailable: p.quantityAvailable as number,
    price:
      typeof p.price === "string" && p.price.length > 0 ? p.price : null,
  }));
}

export async function GET() {
  try {
    await dbConnect();

    const config = await HomepageConfig.findOne().lean();

    const statsDocPromise = ShopPublicStats.findOne({ key: STATS_KEY })
      .lean()
      .then((d) => d?.totalVisits ?? 0);

    const countPromise = ProductMaster.aggregate([
      activeMatch,
      ...latestLookup,
      { $count: "total" },
    ]).then((rows) => (rows[0] as { total?: number } | undefined)?.total ?? 0);

    const browseTiles: ShopHomepageBrowseTile[] = BROWSE_TILE_QUERIES.map(
      ({ label, imageUrl }) => ({
        label,
        imageUrl,
        query: label,
      })
    );

    const [
      popularRaw,
      fastMovingRaw,
      promotionalRaw,
      totalListedProducts,
      totalVisits,
    ] = await Promise.all([
      ProductMaster.aggregate([
        activeMatch,
        ...latestLookup,
        { $match: { "latest.qty": { $gt: 50 }, "latest.price": { $lt: 50 } } },
        { $sort: { "latest.qty": -1 } },
        { $limit: 8 },
        projectStage,
      ]),
      ProductMaster.aggregate([
        activeMatch,
        ...latestLookup,
        { $sample: { size: 8 } },
        projectStage,
      ]),
      config && config.promotionalProductIds.length > 0
        ? ProductMaster.aggregate([
            {
              $match: {
                _id: { $in: config.promotionalProductIds },
                $or: [{ isActive: true }, { isActive: { $exists: false } }],
              },
            },
            ...latestLookup,
            { $limit: 8 },
            projectStage,
          ])
        : ProductMaster.aggregate([
            activeMatch,
            ...latestLookup,
            { $sample: { size: 8 } },
            projectStage,
          ]),
      countPromise,
      statsDocPromise,
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          popular: normalise(popularRaw as Record<string, unknown>[]),
          fastMoving: normalise(fastMovingRaw as Record<string, unknown>[]),
          promotional: normalise(promotionalRaw as Record<string, unknown>[]),
          featuredText: config?.featuredText ?? "",
          bannerText: config?.bannerText ?? "",
          totalListedProducts,
          totalVisits,
          browseTiles,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
