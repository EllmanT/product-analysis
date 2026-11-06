import { handleCertificateUpload } from "@/lib/fiscalCertUpload";
import {
  clearPemCertificates,
  clearPfxCertificate,
  getFiscalSettingsSafe,
  setPemCertificates,
  setPfxCertificate,
} from "@/lib/services/fiscalSettings.service";

/** Certificate for the central device. Branch devices use /api/admin/fiscal-devices/[id]/certificates. */
export async function POST(request: Request) {
  return handleCertificateUpload(request, {
    setPem: setPemCertificates,
    setPfx: setPfxCertificate,
    clearPem: clearPemCertificates,
    clearPfx: clearPfxCertificate,
    safe: getFiscalSettingsSafe,
  }, "/fiscal-settings");
}
