import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { auth } from "@/auth";
import PosProduct from "@/database/posProduct.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { listTerminalProducts } from "@/lib/services/posCatalog.service";

const price = z.number().min(0).max(1e9);

const ProductInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().max(60).optional(),
    hsCode: z.string().trim().max(20).optional(),
    priceUsd: price,
    priceZwg: price.optional(),
    priceOnEntry: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const CreateSchema = z
  .object({
    /** Admin only: omit for a product every branch can sell. */
    branchId: z.string().optional(),
    items: z.array(ProductInput).min(1).max(5000),
  })
  .strict();

/** Products a till can sell (its branch plus global), or `?manage=1` for the full editable list. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const url = new URL(request.url);
    const scoped = await resolvePosScope(session, url.searchParams.get("branchId"));
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;

    if (url.searchParams.get("manage") === "1") {
      if (scope.role === "cashier") {
        return NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 });
      }
      await dbConnect();
      // A branch sees its own products plus the shared ones; an admin with no branch picked sees only the shared list.
      const filter: Record<string, unknown> = scope.branchId
        ? { $or: [{ branchId: new Types.ObjectId(scope.branchId) }, { branchId: { $exists: false } }] }
        : { branchId: { $exists: false } };
      const data = await PosProduct.find(filter).sort({ name: 1 }).limit(20_000).lean();
      return NextResponse.json({ success: true, data });
    }

    if (!scope.branchId) {
      return NextResponse.json({ success: false, message: "branchId is required" }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await listTerminalProducts(scope.branchId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load products";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/** Create or update products by name (also the bulk import). Cashiers cannot change the catalog. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid products", issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 }
      );
    }
    const scoped = await resolvePosScope(session, parsed.data.branchId);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (scope.role === "cashier") {
      return NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 });
    }
    // Branch users always write to their own branch; only admins may write global products.
    const branchId = scope.branchId ? new Types.ObjectId(scope.branchId) : undefined;

    await dbConnect();
    const result = await PosProduct.bulkWrite(
      parsed.data.items.map((it) => ({
        updateOne: {
          filter: { branchId: branchId ?? { $exists: false }, name: it.name },
          update: { $set: { ...it, ...(branchId ? { branchId } : {}) } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    return NextResponse.json({
      success: true,
      data: { created: result.upsertedCount, updated: result.modifiedCount },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save products";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
