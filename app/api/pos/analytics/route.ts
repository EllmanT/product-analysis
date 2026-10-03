import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import { getPosAnalytics } from "@/lib/services/posAnalytics.service";
import { todayInTz } from "@/lib/services/posSale.service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/** Sales analytics for a date range. Branch users and cashiers see their own branch; admins see all or filter. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scoped = await resolvePosScope(await auth(), url.searchParams.get("branchId"));
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (scope.role === "cashier") {
      return NextResponse.json({ success: false, message: "Not allowed" }, { status: 403 });
    }

    const today = todayInTz();
    const from = url.searchParams.get("from") || today;
    const to = url.searchParams.get("to") || from;
    if (!DATE.test(from) || !DATE.test(to) || from > to) {
      return NextResponse.json({ success: false, message: "Invalid date range" }, { status: 400 });
    }
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
      return NextResponse.json({ success: false, message: "Choose a range of one year or less" }, { status: 400 });
    }

    const data = await getPosAnalytics({
      from,
      to,
      branchId: scope.branchId ?? undefined,
      includeTest: scope.isAdmin && url.searchParams.get("includeTest") === "1",
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
