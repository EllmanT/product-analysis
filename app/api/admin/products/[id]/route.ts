import { PipelineStage, Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import { ProductMaster, UploadProduct } from "@/database";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import { requireAdmin } from "@/lib/auth/role";

const PatchBodySchema = z.object({
  isActive: z.boolean(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  await dbConnect();

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, error: "Invalid product id" }, { status: 400 });
  }

  const objectStoreId = new Types.ObjectId(String(data.user.storeId));
  const productObjectId = new Types.ObjectId(id);

  const product = await ProductMaster.findById(productObjectId).lean();
  if (!product) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
  }

  // All upload history for this product at this store, newest first
  // Join with Branch for branch name, and Upload for upload context
  const historyPipeline: PipelineStage[] = [
    { $match: { productId: productObjectId, storeId: objectStoreId } },
    { $sort: { upload_date: -1 } },
    {
      $lookup: {
        from: "branches",
        localField: "branchId",
        foreignField: "_id",
        as: "branch",
      },
    },
    { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        uploadId: 1,
        qty: 1,
        price: { $toDouble: "$price" },
        upload_date: 1,
        week: 1,
        year: 1,
        month: 1,
        branchName: { $ifNull: ["$branch.location", "$branch.name"] },
      },
    },
  ];
  const history = await UploadProduct.aggregate(historyPipeline);

  // Most recent record for "current" stats
  const latest = history[0] ?? null;

  return NextResponse.json(
    {
      success: true,
      data: {
        product: {
          _id: String((product as unknown as { _id: unknown })._id),
          name: (product as unknown as { name: string }).name,
          standardCode: (product as unknown as { standardCode: string }).standardCode,
        },
        currentQty: latest?.qty ?? 0,
        currentPrice: latest?.price ?? 0,
        lastUploadDate: latest?.upload_date ?? null,
        history,
      },
    },
    { status: 200 }
  );
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid product id" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Body must include isActive: boolean" },
      { status: 400 }
    );
  }

  await dbConnect();

  const productObjectId = new Types.ObjectId(id);
  const updated = await ProductMaster.findByIdAndUpdate(
    productObjectId,
    { $set: { isActive: parsed.data.isActive } },
    { new: true, runValidators: true }
  );

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Product not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        _id: String(updated._id),
        isActive: updated.isActive ?? true,
      },
    },
    { status: 200 }
  );
}
