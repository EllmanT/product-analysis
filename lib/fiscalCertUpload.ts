import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { type BundleFileEntry, entriesFromZipBuffer, resolveCertificateBundle } from "@/lib/fiscalCertBundle";
import type { CertActor } from "@/lib/services/fiscalSettings.service";

/** What a certificate upload endpoint needs from the thing it is uploading to (central or a device). */
export interface CertUploadTarget {
  setPem(certPem: string, keyPem: string, actor: CertActor): Promise<void>;
  setPfx(base64: string, passphrase: string, actor: CertActor): Promise<void>;
  clearPem(actor: CertActor): Promise<void>;
  clearPfx(actor: CertActor): Promise<void>;
  /** The sanitised settings to return after a change. Never contains key material. */
  safe(): Promise<unknown>;
}

async function loadBundleEntries(
  mode: string,
  form: FormData
): Promise<{ entries: BundleFileEntry[] } | { error: string }> {
  if (mode === "bundle_zip") {
    const f = form.get("bundle");
    if (!(f instanceof File)) return { error: "Zip file required (field: bundle)" };
    if (!f.name.toLowerCase().endsWith(".zip")) return { error: "Upload a .zip file" };
    try {
      return { entries: entriesFromZipBuffer(Buffer.from(await f.arrayBuffer())) };
    } catch {
      return { error: "Could not read zip archive (corrupt or not a ZIP)" };
    }
  }

  if (mode === "bundle_folder") {
    const files = form.getAll("files").filter((x): x is File => x instanceof File);
    if (files.length === 0) return { error: "No files selected — use “Choose folder” or upload a .zip" };
    const entries = await Promise.all(
      files.map(async (file) => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        return { path: rel.replace(/\\/g, "/"), content: Buffer.from(await file.arrayBuffer()) };
      })
    );
    return { entries };
  }

  return { error: "Invalid bundle mode" };
}

/** Certificate upload (PEM pair, PFX, ZIMRA zip or folder) for any device. The caller says which permission it needs. */
export async function handleCertificateUpload(request: Request, target: CertUploadTarget, permission: string): Promise<NextResponse> {
  try {
    const session = await auth();
    const denied = requirePermission(session, permission);
    if (denied) return denied;
    const actor: CertActor = { id: session?.user?.id, email: session?.user?.email };

    if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return NextResponse.json({ success: false, message: "Expected multipart/form-data" }, { status: 400 });
    }

    const form = await request.formData();
    const mode = String(form.get("mode") ?? "pem");

    if (mode === "clear_pem") {
      await target.clearPem(actor);
      return NextResponse.json({ success: true, data: await target.safe() });
    }
    if (mode === "clear_pfx") {
      await target.clearPfx(actor);
      return NextResponse.json({ success: true, data: await target.safe() });
    }

    if (mode === "bundle_zip" || mode === "bundle_folder") {
      const dryRun = form.get("dryRun") === "true";
      const passphrase = String(form.get("passphrase") ?? "");
      const loaded = await loadBundleEntries(mode, form);
      if ("error" in loaded) return NextResponse.json({ success: false, message: loaded.error }, { status: 400 });

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

      const resolved = resolveCertificateBundle(loaded.entries, { pfxPassphrase: passphrase });
      if (dryRun) {
        return NextResponse.json({ success: true, dryRun: true, storable: resolved.storable, validation: resolved.validation });
      }
      if (!resolved.storable) {
        return NextResponse.json(
          {
            success: false,
            message: resolved.validation.missing.join(" ") || "Certificate bundle is incomplete — see validation details",
            validation: resolved.validation,
          },
          { status: 422 }
        );
      }

      if (resolved.storeAs === "pfx" && resolved.pfxBase64) {
        await target.setPfx(resolved.pfxBase64, passphrase, actor);
      } else if (resolved.storeAs === "pem" && resolved.certPem && resolved.keyPem) {
        await target.setPem(resolved.certPem, resolved.keyPem, actor);
      }
      return NextResponse.json({ success: true, data: await target.safe(), validation: resolved.validation });
    }

    if (mode === "pfx") {
      const pfx = form.get("pfx");
      if (!(pfx instanceof File)) return NextResponse.json({ success: false, message: "PFX file required" }, { status: 400 });
      await target.setPfx(Buffer.from(await pfx.arrayBuffer()).toString("base64"), String(form.get("passphrase") ?? ""), actor);
      return NextResponse.json({ success: true, data: await target.safe() });
    }

    const cert = form.get("cert");
    const key = form.get("key");
    if (!(cert instanceof File) || !(key instanceof File)) {
      return NextResponse.json({ success: false, message: "Certificate and key files required" }, { status: 400 });
    }
    await target.setPem(await cert.text(), await key.text(), actor);
    return NextResponse.json({ success: true, data: await target.safe() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Certificate upload failed";
    // Validation problems (mismatched key, expired certificate, missing master key) are not server faults.
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
