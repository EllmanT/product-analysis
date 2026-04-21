import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import {
  getFiscalSettingsSafe,
  patchFiscalSettings,
} from "@/lib/services/fiscalSettings.service";

const patchSchema = z.object({
  zimraApiUrl: z.string().nullable().optional(),
  zimraUseProductionUrl: z.boolean().optional(),
  deviceId: z.string().nullable().optional(),
  deviceSerialNumber: z.string().nullable().optional(),
  autoScheduleEnabled: z.boolean().optional(),
  autoCloseEnabled: z.boolean().optional(),
  autoOpenEnabled: z.boolean().optional(),
  closeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  openTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().min(1).optional(),
  closeWeekdays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  openWeekdays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
});

export async function GET() {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const settings = await getFiscalSettingsSafe();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const body = (await request.json()) as unknown;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const settings = await patchFiscalSettings(parsed.data);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
