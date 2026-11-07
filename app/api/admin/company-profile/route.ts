import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { getCompanyProfile, saveCompanyProfile } from "@/lib/services/companyProfile.service";

const text = (max: number) => z.string().trim().max(max).optional();
const Body = z
  .object({
    companyName: text(120),
    tradeName: text(120),
    tin: text(40),
    vatNumber: text(40),
    address: text(200),
    phone: text(40),
    email: z.string().trim().email().max(120).optional().or(z.literal("")),
    logoUrl: text(500),
    footerLines: z.array(z.string().trim().max(80)).max(6).optional(),
  })
  .strict();

/** Admin: the company profile printed on every receipt and invoice. */
export async function GET() {
  const denied = requirePermission(await auth(), "/settings");
  if (denied) return denied;
  return NextResponse.json({ success: true, data: await getCompanyProfile() });
}

export async function PUT(request: Request) {
  const denied = requirePermission(await auth(), "/settings");
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid company details" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: await saveCompanyProfile(parsed.data) });
}
