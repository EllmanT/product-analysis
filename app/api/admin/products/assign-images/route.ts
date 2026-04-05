import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import ProductMaster from "@/database/productmaster.model";
import dbConnect from "@/lib/mongoose";
import { assignProductImage } from "@/lib/utils/assignProductImage";

const BATCH = 100;

export async function POST() {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;

  await dbConnect();

  let updated = 0;
  for (;;) {
    const docs = await ProductMaster.find({
      $or: [
        { imageUrl: { $exists: false } },
        { imageUrl: null },
        { imageUrl: "" },
      ],
    })
      .limit(BATCH)
      .select("_id name standardCode")
      .lean();

    if (docs.length === 0) break;

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
    { success: true, data: { updated } },
    { status: 200 }
  );
}
