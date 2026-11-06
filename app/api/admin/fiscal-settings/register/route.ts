import { handleRegistration } from "@/lib/fiscalRegistrationApi";
import { getFiscalSettingsSafe } from "@/lib/services/fiscalSettings.service";

export const maxDuration = 60;

/** Register the central device with ZIMRA (device ID + activation key), or recover it after its certificate expired. */
export async function POST(request: Request) {
  return handleRegistration(request, "central", getFiscalSettingsSafe, "/fiscal-settings");
}
