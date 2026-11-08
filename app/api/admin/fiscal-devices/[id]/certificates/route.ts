import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { fiscalBackend } from "@/lib/fiscal/client";
import { deviceError } from "@/lib/fiscalDeviceApi";
import { handleCertificateUpload } from "@/lib/fiscalCertUpload";
import {
  clearDevicePem,
  clearDevicePfx,
  getFiscalDeviceSafe,
  setDevicePem,
  setDevicePfx,
} from "@/lib/services/fiscalDevice.service";
import { pushCertificateToService } from "@/lib/services/fiscalServiceDevices.service";

/** Certificate for one branch device. Same modes and validation as the central endpoint. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Check the caller before revealing whether a device id exists.
  const denied = requirePermission(await auth(), "/fiscal-devices");
  if (denied) return denied;
  const { id } = await params;
  if (!(await getFiscalDeviceSafe(id))) {
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  }
  const viaService = fiscalBackend() === "service";
  return handleCertificateUpload(request, {
    setPem: async (c, k, a) => {
      // The service asks ZIMRA first; a certificate ZIMRA refuses is refused here and nothing is stored.
      if (viaService) await pushCertificateToService(id, c, k);
      await setDevicePem(id, c, k, a);
    },
    setPfx: async (b, p, a) => {
      if (viaService) throw new Error("The fiscal service needs the certificate and key as separate files (.crt and .key), not a PFX. Use the zip ZIMRA sent.");
      await setDevicePfx(id, b, p, a);
    },
    clearPem: (a) => clearDevicePem(id, a),
    clearPfx: (a) => clearDevicePfx(id, a),
    safe: () => getFiscalDeviceSafe(id),
  }, "/fiscal-devices");
}
