import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { importStockToPos, StockImportError } from "@/lib/services/posCatalog.service";

const Body = z
  .object({
    branchId: z.string().optional(),
    /** Also replace the USD price of products that are already in the POS list. */
    overwritePrices: z.boolean().optional(),
    /** Include lines with no stock on hand (default: only what is in stock). */
    includeOutOfStock: z.boolean().optional(),
  })
  .strict();

/** Fill the branch's POS product list from its most recent stock upload (see importStockToPos). */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });

    const scoped = await resolvePosScope(await auth(), parsed.data.branchId);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (scope.role === "cashier") {
      return NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 });
    }
    if (!scope.branchId) {
      return NextResponse.json({ success: false, message: "Choose a branch to import into" }, { status: 400 });
    }

    const data = await importStockToPos(scope.branchId, {
      overwritePrices: parsed.data.overwritePrices,
      includeOutOfStock: parsed.data.includeOutOfStock,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof StockImportError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to import from stock";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
