import type { PipelineStage } from "mongoose";

import { activeProductMatchStage } from "./catalogHelpers";

/** Join latest in-stock upload row (same as /api/shop/products). */
export function stockLookupWithPositiveQtyStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: "uploadproducts",
        let: { pid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$productId", "$$pid"] },
                  { $gt: ["$qty", 0] },
                ],
              },
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
  ];
}

export function projectShopProductCardStage(): PipelineStage {
  return {
    $project: {
      _id: 1,
      name: 1,
      standardCode: 1,
      imageUrl: 1,
      quantityAvailable: "$latest.qty",
      price: { $toString: "$latest.price" },
    },
  };
}

/** Stages used at the start of shop-style product queries. */
export function shopCatalogBaseStages(): PipelineStage[] {
  return [activeProductMatchStage()];
}
