import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import Branch from "@/database/branch.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { allocateNumber, formatInvoiceNumber, seriesFor } from "@/lib/services/posNumbering.service";

const Body = z
  .object({
    branchId: z.string().optional(),
    currency: z.enum(["USD", "ZWG"]),
    count: z.number().int().min(1).max(200),
  })
  .strict();

/** The most a till may hold unused per currency; stops a runaway client from burning numbers. */
const MAX_OUTSTANDING = 400;

/**
 * Hand a till a block of provisional receipt numbers (HUP0101 ...). The till uses them while it is
 * offline so every slip it prints already carries a unique number. Unused numbers are simply
 * skipped; the provisional series is not the fiscal series, so gaps in it are harmless.
 */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });

    const scoped = await resolvePosScope(await auth(), parsed.data.branchId);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (!scope.branchId) return NextResponse.json({ success: false, message: "branchId is required" }, { status: 400 });

    await dbConnect();
    const branch = await Branch.findById(scope.branchId).select("pos").lean<{ pos?: { enabled?: boolean; invoicePrefix?: string } }>();
    if (!branch?.pos?.enabled || !branch.pos.invoicePrefix) {
      return NextResponse.json({ success: false, message: "POS is not enabled for this branch" }, { status: 403 });
    }
    const { currency, count } = parsed.data;
    if (count > MAX_OUTSTANDING) {
      return NextResponse.json({ success: false, message: "Too many numbers requested" }, { status: 400 });
    }

    const series = seriesFor(currency, true);
    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const n = await allocateNumber(scope.branchId, series);
      numbers.push(formatInvoiceNumber(branch.pos.invoicePrefix, currency, n, true));
    }
    return NextResponse.json({ success: true, data: { currency, numbers } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to lease numbers";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
