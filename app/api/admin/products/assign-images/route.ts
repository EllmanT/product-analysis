import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import ProductMaster, { type IProductMaster } from "@/database/productmaster.model";
import dbConnect from "@/lib/mongoose";
import { assignProductImage } from "@/lib/utils/assignProductImage";
import type { FilterQuery } from "mongoose";

const BATCH = 100;

export async function POST(req: Request) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;

  let replaceAll = new URL(req.url).searchParams.get("replaceAll") === "true";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const body = (await req.json()) as { replaceAll?: boolean };
      if (typeof body?.replaceAll === "boolean") replaceAll = body.replaceAll;
    } catch {
      /* empty or invalid JSON body */
    }
  }

  await dbConnect();

  const missingOnlyFilter: FilterQuery<IProductMaster> = {
    $or: [
      { imageUrl: { $exists: false } },
      { imageUrl: null },
      { imageUrl: "" },
    ],
  };

  let updated = 0;
  let lastId: string | null = null;

  for (;;) {
    const filter: FilterQuery<IProductMaster> = replaceAll
      ? {}
      : { ...missingOnlyFilter };

    if (lastId) {
      filter._id = { $gt: lastId };
    }

    const docs = await ProductMaster.find(filter)
      .sort({ _id: 1 })
      .limit(BATCH)
      .select("_id name standardCode")
      .lean();

    if (docs.length === 0) break;

    lastId = String(docs[docs.length - 1]._id);

    const ops = docs.map((d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            imageUrl: assignProductImage(d.name, d.standardCode),
          },
        },
      },
    }));

    await ProductMaster.bulkWrite(ops);
    updated += docs.length;
  }

  return NextResponse.json(
    { success: true, data: { updated, replaceAll } },
    { status: 200 }
  );
}
