import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import User from "@/database/user.model";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { getFiscalAlertSettings, saveFiscalAlertSettings } from "@/lib/services/fiscalAlertSettings.service";

const bodySchema = z.object({
  recipientMode: z.enum(["all_admins", "selected"]),
  userIds: z.array(z.string()).max(100).default([]),
  extraEmails: z.array(z.string()).max(50).default([]),
});

export async function GET() {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    await dbConnect();
    const [settings, admins] = await Promise.all([
      getFiscalAlertSettings(),
      User.find({ role: "admin" }).select("name email").sort({ name: 1 }).lean<{ _id: unknown; name?: string; email: string }[]>(),
    ]);
    return NextResponse.json({
      success: true,
      data: { settings, admins: admins.map((a) => ({ id: String(a._id), name: a.name ?? a.email, email: a.email })) },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to load" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const denied = requireAdmin(await auth());
    if (denied) return denied;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid settings" }, { status: 400 });
    return NextResponse.json({ success: true, data: await saveFiscalAlertSettings(parsed.data) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to save" }, { status: 400 });
  }
}
