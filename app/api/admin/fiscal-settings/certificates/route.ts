import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/role";
import {
  type BundleFileEntry,
  entriesFromZipBuffer,
  resolveCertificateBundle,
} from "@/lib/fiscalCertBundle";
import {
  clearPemCertificates,
  clearPfxCertificate,
  getFiscalSettingsSafe,
  setPemCertificates,
  setPfxCertificate,
} from "@/lib/services/fiscalSettings.service";

async function loadBundleEntries(
  mode: string,
  form: FormData
): Promise<{ entries: BundleFileEntry[] } | { error: string }> {
  if (mode === "bundle_zip") {
    const f = form.get("bundle");
    if (!(f instanceof File)) {
      return { error: "Zip file required (field: bundle)" };
    }
    if (!f.name.toLowerCase().endsWith(".zip")) {
      return { error: "Upload a .zip file" };
    }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      return { entries: entriesFromZipBuffer(buf) };
    } catch {
      return { error: "Could not read zip archive (corrupt or not a ZIP)" };
    }
  }

  if (mode === "bundle_folder") {
    const files = form.getAll("files").filter((x): x is File => x instanceof File);
    if (files.length === 0) {
      return { error: "No files selected — use “Choose folder” or upload a .zip" };
    }
    const entries = await Promise.all(
      files.map(async (file) => {
        const rel =
          typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath ===
            "string" &&
          (file as File & { webkitRelativePath?: string }).webkitRelativePath
            ? (file as File & { webkitRelativePath: string }).webkitRelativePath
            : file.name;
        return {
          path: rel.replace(/\\/g, "/"),
          content: Buffer.from(await file.arrayBuffer()),
        };
      })
    );
    return { entries };
  }

  return { error: "Invalid bundle mode" };
}

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

    if (mode === "bundle_zip" || mode === "bundle_folder") {
      const dryRun = form.get("dryRun") === "true";
      const passphrase = String(form.get("passphrase") ?? "");
      const loaded = await loadBundleEntries(mode, form);
      if ("error" in loaded) {
        return NextResponse.json({ success: false, message: loaded.error }, { status: 400 });
      }

      if (loaded.entries.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Archive or folder contained no files after filtering",
            validation: {
              filesScanned: [],
              usedFiles: [],
              ignored: [],
              missing: ["No files found inside the zip or folder."],
              warnings: [],
              tlsReady: null,
            },
          },
          { status: 422 }
        );
      }

      const resolved = resolveCertificateBundle(loaded.entries, {
        pfxPassphrase: passphrase,
      });

      if (dryRun) {
        return NextResponse.json({
          success: true,
          dryRun: true,
          storable: resolved.storable,
          validation: resolved.validation,
        });
      }

      if (!resolved.storable) {
        return NextResponse.json(
          {
            success: false,
            message:
              resolved.validation.missing.join(" ") ||
              "Certificate bundle is incomplete — see validation details",
            validation: resolved.validation,
          },
          { status: 422 }
        );
      }

      if (resolved.storeAs === "pfx" && resolved.pfxBase64) {
        await setPfxCertificate(resolved.pfxBase64, passphrase);
      } else if (
        resolved.storeAs === "pem" &&
        resolved.certPem &&
        resolved.keyPem
      ) {
        await setPemCertificates(resolved.certPem, resolved.keyPem);
      }

      const data = await getFiscalSettingsSafe();
      return NextResponse.json({
        success: true,
        data,
        validation: resolved.validation,
      });
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
