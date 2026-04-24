import { ProductMaster } from "@/database";
import type {
  DocumentMatchConfidence,
  ExtractedLine,
  ShopProductMatchRow,
} from "@/types/shop-document-match";
import type { PipelineStage } from "mongoose";

import { escapeRegex } from "./catalogHelpers";
import {
  shopCatalogBaseStages,
  stockLookupWithPositiveQtyStages,
} from "./shopProductPipeline";

const MATCH_MIN_SCORE = 115;
const ALTERNATE_MIN_SCORE = 70;
const MAX_REGEX_LEN = 72;

type Scored = { row: ShopProductMatchRow; score: number; textScore: number };

function normalizePrice(p: string): string | null {
  return p && p.length > 0 ? p : null;
}

function mapAggToRow(p: {
  _id: unknown;
  name: string;
  standardCode: string;
  imageUrl?: string | null;
  quantityAvailable: number;
  price: string;
}): ShopProductMatchRow {
  return {
    _id: String(p._id),
    name: p.name,
    standardCode: p.standardCode,
    imageUrl: p.imageUrl ?? null,
    quantityAvailable: p.quantityAvailable,
    price: normalizePrice(p.price),
  };
}

function textSearchQuery(description: string): string | null {
  const words = description
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 10);
  if (words.length === 0) return null;
  return words.join(" ");
}

function scoreCandidate(
  item: ExtractedLine,
  product: {
    name: string;
    standardCode: string;
    aliases?: string[];
  },
  textScore: number
): number {
  const code = (item.skuOrCode || "").trim().toLowerCase();
  const desc = item.description.trim().toLowerCase();
  const name = product.name.toLowerCase();
  const std = product.standardCode.toLowerCase();
  const aliases = (product.aliases || []).map((a) => a.toLowerCase());

  if (code && std === code) return 1000;
  if (code && aliases.includes(code)) return 950;

  if (name === desc) return 900;
  if (desc.length >= 3 && name.startsWith(desc.slice(0, Math.min(24, desc.length))))
    return 420;
  if (desc.length >= 4 && name.includes(desc)) return 360;

  const tokens = desc.split(/\s+/).filter((t) => t.length > 2);
  const overlap = tokens.filter((t) => name.includes(t)).length;
  if (tokens.length > 0 && overlap / tokens.length >= 0.55) {
    return 220 + overlap * 35 + textScore * 15;
  }
  if (textScore > 0) return 130 + textScore * 25;
  if (tokens[0] && name.includes(tokens[0])) return 95;
  return 20;
}

function confidenceFromScore(score: number): DocumentMatchConfidence {
  if (score >= 500) return "high";
  if (score >= 200) return "medium";
  return "low";
}

async function aggregateRows(
  pipeline: PipelineStage[]
): Promise<
  Array<{
    _id: unknown;
    name: string;
    standardCode: string;
    imageUrl?: string | null;
    quantityAvailable: number;
    price: string;
    aliases?: string[];
    textScore?: number;
  }>
> {
  const rows = await ProductMaster.aggregate(pipeline);
  return rows as typeof rows;
}

function codeMatchStages(code: string): PipelineStage[] {
  const escaped = escapeRegex(code.trim());
  return [
    {
      $match: {
        $or: [
          { standardCode: { $regex: `^${escaped}$`, $options: "i" } },
          {
            $expr: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$aliases", []] },
                      as: "a",
                      cond: {
                        $regexMatch: {
                          input: "$$a",
                          regex: `^${escaped}$`,
                          options: "i",
                        },
                      },
                    },
                  },
                },
                0,
              ],
            },
          },
        ],
      },
    },
  ];
}

function regexFallbackStages(fragment: string): PipelineStage[] {
  const frag = fragment.slice(0, MAX_REGEX_LEN).trim();
  const e = escapeRegex(frag);
  return [
    {
      $match: {
        $or: [
          { name: { $regex: e, $options: "i" } },
          { standardCode: { $regex: e, $options: "i" } },
          {
            aliases: {
              $elemMatch: { $regex: e, $options: "i" },
            },
          },
        ],
      },
    },
  ];
}

export async function matchExtractedLine(item: ExtractedLine): Promise<{
  status: "matched" | "unavailable";
  confidence: DocumentMatchConfidence | null;
  reason?: string;
  match: ShopProductMatchRow | null;
  alternates: ShopProductMatchRow[];
}> {
  const code = (item.skuOrCode || "").trim();
  let candidates: Scored[] = [];

  if (code.length >= 1) {
    const pipeline: PipelineStage[] = [
      ...shopCatalogBaseStages(),
      ...codeMatchStages(code),
      ...stockLookupWithPositiveQtyStages(),
      { $limit: 8 },
      {
        $project: {
          _id: 1,
          name: 1,
          standardCode: 1,
          imageUrl: 1,
          aliases: 1,
          quantityAvailable: "$latest.qty",
          price: { $toString: "$latest.price" },
        },
      },
    ];
    const rows = await aggregateRows(pipeline);
    candidates = rows.map((r) => ({
      row: mapAggToRow(r),
      score: scoreCandidate(item, r, 0),
      textScore: 0,
    }));
  }

  if (candidates.length === 0) {
    const q = textSearchQuery(item.description);
    if (q) {
      const pipeline: PipelineStage[] = [
        ...shopCatalogBaseStages(),
        { $match: { $text: { $search: q } } },
        { $addFields: { textScore: { $meta: "textScore" } } },
        ...stockLookupWithPositiveQtyStages(),
        { $sort: { textScore: -1 } },
        { $limit: 12 },
        {
          $project: {
            _id: 1,
            name: 1,
            standardCode: 1,
            imageUrl: 1,
            aliases: 1,
            quantityAvailable: "$latest.qty",
            price: { $toString: "$latest.price" },
            textScore: 1,
          },
        },
      ];
      try {
        const rows = await aggregateRows(pipeline);
        candidates = rows.map((r) => {
          const ts = typeof r.textScore === "number" ? r.textScore : 0;
          return {
            row: mapAggToRow(r),
            score: scoreCandidate(item, r, ts),
            textScore: ts,
          };
        });
      } catch {
        candidates = [];
      }
    }
  }

  if (candidates.length === 0) {
    const fragment =
      item.description.trim() || item.rawLine.trim() || code;
    if (fragment.trim().length >= 2) {
      const pipeline: PipelineStage[] = [
        ...shopCatalogBaseStages(),
        ...regexFallbackStages(fragment),
        ...stockLookupWithPositiveQtyStages(),
        { $limit: 12 },
        {
          $project: {
            _id: 1,
            name: 1,
            standardCode: 1,
            imageUrl: 1,
            aliases: 1,
            quantityAvailable: "$latest.qty",
            price: { $toString: "$latest.price" },
          },
        },
      ];
      const rows = await aggregateRows(pipeline);
      candidates = rows.map((r) => ({
        row: mapAggToRow(r),
        score: scoreCandidate(item, r, 0),
        textScore: 0,
      }));
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < MATCH_MIN_SCORE) {
    return {
      status: "unavailable",
      confidence: null,
      reason:
        "No close in-stock match in the catalog. This product may not be listed or is out of stock.",
      match: null,
      alternates: [],
    };
  }

  const matchRow = best.row;
  const alternates = candidates
    .slice(1)
    .filter((c) => c.score >= ALTERNATE_MIN_SCORE && c.row._id !== matchRow._id)
    .slice(0, 3)
    .map((c) => c.row);

  return {
    status: "matched",
    confidence: confidenceFromScore(best.score),
    match: matchRow,
    alternates,
  };
}
