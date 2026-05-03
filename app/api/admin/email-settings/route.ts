import { NextResponse } from "next/server";

import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { ValidationError } from "@/lib/http-errors";
import { requireAdmin } from "@/lib/auth/role";
import {
  getEmailSettingsSafe,
  patchEmailSettings,
  patchEmailSettingsSchema,
} from "@/lib/services/emailSettings.service";

export async function GET() {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const data = await getEmailSettingsSafe();
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const json = await request.json();
    const parsed = patchEmailSettingsSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = await patchEmailSettings(parsed.data);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
