import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { todayInTz } from "@/lib/services/posSale.service";
import { tillReport } from "@/lib/services/posTill.service";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Sales per till for a date range (?from=&to=, default today). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const scoped = await resolvePosScope(await auth(), id);
    if (!scoped.ok) return scoped.response;
    const url = new URL(request.url);
    const today = todayInTz();
    const from = url.searchParams.get("from") ?? today;
    const to = url.searchParams.get("to") ?? from;
    if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
      return NextResponse.json({ success: false, message: "Invalid date range" }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await tillReport(id, from, to) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build till report";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
