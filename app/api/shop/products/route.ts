import { ProductMaster, UploadProduct } from "@/database";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";

const PAGE_SIZE = 24;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decimalToPriceString(value: unknown): string | null {
  if (value == null) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    "$numberDecimal" in value
  ) {
    return (value as { $numberDecimal: string }).$numberDecimal;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const s = (value as { toString: () => string }).toString();
    if (s && !s.startsWith("[object ")) return s;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const q = searchParams.get("search")?.trim() || "";

    const filter =
      q.length > 0
        ? {
            $or: [
              { name: { $regex: escapeRegex(q), $options: "i" } },
              { standardCode: { $regex: escapeRegex(q), $options: "i" } },
            ],
          }
        : {};

    const total = await ProductMaster.countDocuments(filter);
    const docs = await ProductMaster.find(filter)
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select("name standardCode")
      .lean();

    const ids = docs.map((d) => d._id as Types.ObjectId);
    const uploadByProduct = new Map<
      string,
      { price: string | null; quantityAvailable: number }
    >();

    if (ids.length > 0) {
      const latest = await UploadProduct.aggregate<{
        _id: Types.ObjectId;
        price: unknown;
        qty: number;
      }>([
        { $match: { productId: { $in: ids } } },
        { $sort: { upload_date: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$productId",
            price: { $first: "$price" },
            qty: { $first: "$qty" },
          },
        },
      ]);

      for (const row of latest) {
        uploadByProduct.set(String(row._id), {
          price: decimalToPriceString(row.price),
          quantityAvailable: typeof row.qty === "number" ? row.qty : 0,
        });
      }
    }

    const products = docs.map((p) => {
      const id = String(p._id);
      const u = uploadByProduct.get(id);
      return {
        _id: id,
        name: p.name,
        standardCode: p.standardCode,
        price: u?.price ?? null,
        quantityAvailable: u?.quantityAvailable ?? 0,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          products,
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
