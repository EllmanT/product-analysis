import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import { closeFiscalDay } from "@/lib/services/invoice.service";

export async function POST(_request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await closeFiscalDay();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close fiscal day";
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
