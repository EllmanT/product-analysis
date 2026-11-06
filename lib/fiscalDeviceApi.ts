import { NextResponse } from "next/server";
import { z } from "zod";

import { SecretBoxError } from "@/lib/security/secretBox";
import { RenewalError } from "@/lib/services/fiscalCertRenewal.service";
import { DeviceConfigError } from "@/lib/services/fiscalDevice.service";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const weekdays = z.array(z.number().int().min(1).max(7)).min(1);

export const deviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().optional(),
  zimraApiUrl: z.string().trim().url().max(300).nullable().optional(),
  zimraUseProductionUrl: z.boolean().optional(),
  deviceId: z.string().trim().max(20).nullable().optional(),
  deviceSerialNumber: z.string().trim().max(40).nullable().optional(),
  autoRenewCertificate: z.boolean().optional(),
  serviceDeviceId: z.string().trim().regex(/^[a-f0-9]{24}$/, "Must be the 24 character id the fiscal service gave this device").nullable().optional().or(z.literal("")),
  deviceModelName: z.string().trim().max(60).nullable().optional(),
  deviceModelVersion: z.string().trim().max(30).nullable().optional(),
  vdEmail: z.string().trim().max(120).nullable().optional(),
  /** Plain text in; stored encrypted and never returned. */
  vdPassword: z.string().max(200).nullable().optional(),
  autoScheduleEnabled: z.boolean().optional(),
  autoCloseEnabled: z.boolean().optional(),
  autoOpenEnabled: z.boolean().optional(),
  closeTime: hhmm.optional(),
  openTime: hhmm.optional(),
  timezone: z.string().min(1).max(60).optional(),
  closeWeekdays: weekdays.optional(),
  openWeekdays: weekdays.optional(),
});

export function deviceError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof DeviceConfigError || error instanceof SecretBoxError || error instanceof RenewalError ? 422 : 500;
  return NextResponse.json({ success: false, message }, { status });
}
