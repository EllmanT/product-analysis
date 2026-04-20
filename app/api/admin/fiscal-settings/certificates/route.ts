import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import {
  clearPemCertificates,
  clearPfxCertificate,
  getFiscalSettingsSafe,
  setPemCertificates,
  setPfxCertificate,
} from "@/lib/services/fiscalSettings.service";

export async function POST(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, message: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const mode = String(form.get("mode") ?? "pem");

    if (mode === "clear_pem") {
      await clearPemCertificates();
      const data = await getFiscalSettingsSafe();
      return NextResponse.json({ success: true, data });
    }
    if (mode === "clear_pfx") {
      await clearPfxCertificate();
      const data = await getFiscalSettingsSafe();
      return NextResponse.json({ success: true, data });
    }

    if (mode === "pfx") {
      const pfx = form.get("pfx");
      const passphrase = String(form.get("passphrase") ?? "");
      if (!(pfx instanceof File)) {
        return NextResponse.json(
          { success: false, message: "PFX file required" },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await pfx.arrayBuffer());
      await setPfxCertificate(buf.toString("base64"), passphrase);
      const data = await getFiscalSettingsSafe();
      return NextResponse.json({ success: true, data });
    }

    const cert = form.get("cert");
    const key = form.get("key");
    if (!(cert instanceof File) || !(key instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Certificate and key files required" },
        { status: 400 }
      );
    }
    const certPem = await cert.text();
    const keyPem = await key.text();
    await setPemCertificates(certPem, keyPem);
    const data = await getFiscalSettingsSafe();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Certificate upload failed";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
