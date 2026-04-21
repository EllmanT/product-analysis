import { unzipSync } from "fflate";

export type BundleFileEntry = {
  /** Relative path inside zip or webkitRelativePath from folder picker */
  path: string;
  content: Buffer;
};

export type CertBundleIgnored = { path: string; reason: string };

export type CertBundleValidation = {
  filesScanned: string[];
  usedFiles: string[];
  ignored: CertBundleIgnored[];
  missing: string[];
  warnings: string[];
  /** What the archive can supply for mTLS */
  tlsReady: "pfx" | "pem" | null;
};

function basename(p: string): string {
  const n = p.replace(/\\/g, "/").split("/").pop();
  return n ?? p;
}

function isSkippedPath(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  if (norm.includes("__MACOSX/")) return true;
  if (norm.split("/").some((s) => s === ".DS_Store")) return true;
  return false;
}

/**
 * Expand a .zip buffer into file entries (synchronous, small bundles only — typical cert folders).
 */
export function entriesFromZipBuffer(buffer: Buffer): BundleFileEntry[] {
  const raw = unzipSync(new Uint8Array(buffer), {
    filter: (info) => {
      const p = info.name.replace(/\\/g, "/");
      if (p.endsWith("/")) return false;
      return !isSkippedPath(p);
    },
  });
  const out: BundleFileEntry[] = [];
  for (const [relPath, u8] of Object.entries(raw)) {
    if (isSkippedPath(relPath)) continue;
    out.push({
      path: relPath.replace(/\\/g, "/"),
      content: Buffer.from(u8),
    });
  }
  return out;
}

function classifyPemText(text: string): "cert" | "key" | "csr" | "unknown" {
  const t = text.trim();
  if (t.includes("BEGIN CERTIFICATE REQUEST")) return "csr";
  if (t.includes("BEGIN CERTIFICATE")) return "cert";
  if (/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(t)) return "key";
  return "unknown";
}

function pfxSortScore(path: string): number {
  const b = basename(path).toLowerCase();
  if (b === "certificate.pfx") return 0;
  if (b.endsWith(".pfx")) return 1;
  if (b.endsWith(".p12")) return 2;
  return 3;
}

function pickBestEntry<T extends { path: string; score: number }>(
  entries: T[],
  preferredBaseNames: string[]
): T | undefined {
  if (entries.length === 0) return undefined;
  const prefLower = preferredBaseNames.map((p) => p.toLowerCase());
  return [...entries].sort((a, b) => {
    const ba = basename(a.path).toLowerCase();
    const bb = basename(b.path).toLowerCase();
    const ia = prefLower.indexOf(ba);
    const ib = prefLower.indexOf(bb);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.score - b.score;
  })[0];
}

export type ResolveBundleResult = {
  validation: CertBundleValidation;
  storable: boolean;
  storeAs: "pfx" | "pem" | null;
  pfxBase64?: string;
  certPem?: string;
  keyPem?: string;
};

/**
 * Inspect a flat list of files (from a zip or folder upload) and decide whether we can store PFX or PEM mTLS material.
 */
export function resolveCertificateBundle(
  entries: BundleFileEntry[],
  opts: { pfxPassphrase: string }
): ResolveBundleResult {
  const filesScanned = entries.map((e) => e.path);
  const ignored: CertBundleIgnored[] = [];
  const warnings: string[] = [];

  const pfxEntries: BundleFileEntry[] = [];
  const keyEntries: { path: string; text: string; score: number }[] = [];
  const certEntries: { path: string; text: string; score: number }[] = [];

  for (const ent of entries) {
    const name = basename(ent.path);
    const lower = name.toLowerCase();
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";

    if (ext === ".pfx" || ext === ".p12") {
      pfxEntries.push(ent);
      continue;
    }

    let text: string;
    try {
      text = ent.content.toString("utf8");
    } catch {
      ignored.push({ path: ent.path, reason: "Could not read as UTF-8 (skipped)" });
      continue;
    }

    if (ext === ".key") {
      const kind = classifyPemText(text);
      if (kind === "key") {
        keyEntries.push({ path: ent.path, text, score: lower === "key.key" ? 0 : 1 });
      } else if (kind === "csr") {
        ignored.push({
          path: ent.path,
          reason: "Certificate signing request (.key content looks like CSR)",
        });
      } else {
        warnings.push(`${name}: .key file does not look like a PEM private key`);
        ignored.push({ path: ent.path, reason: "Unrecognized .key content" });
      }
      continue;
    }

    if (ext === ".crt" || ext === ".cer") {
      const kind = classifyPemText(text);
      if (kind === "cert") {
        certEntries.push({
          path: ent.path,
          text,
          score: lower === "cert.crt" || lower === "certificate.crt" ? 0 : 1,
        });
      } else {
        ignored.push({ path: ent.path, reason: "File does not contain a PEM certificate" });
      }
      continue;
    }

    if (ext === ".pem") {
      const kind = classifyPemText(text);
      if (kind === "csr" || lower.includes("csr")) {
        ignored.push({
          path: ent.path,
          reason: "Certificate signing request (not used for mTLS client auth)",
        });
        continue;
      }
      if (kind === "cert") {
        certEntries.push({ path: ent.path, text, score: lower.includes("cert") ? 0 : 2 });
        continue;
      }
      if (kind === "key") {
        keyEntries.push({ path: ent.path, text, score: lower.includes("key") ? 0 : 2 });
        continue;
      }
      ignored.push({ path: ent.path, reason: "PEM file is not a certificate or private key" });
      continue;
    }

    ignored.push({ path: ent.path, reason: "Not a recognized TLS file type" });
  }

  pfxEntries.sort((a, b) => pfxSortScore(a.path) - pfxSortScore(b.path));
  const chosenPfx = pfxEntries[0] ?? null;

  const certPick = pickBestEntry(certEntries, ["cert.crt", "certificate.crt", "cert.pem"]);
  const keyPick = pickBestEntry(keyEntries, ["key.key", "private.key", "key.pem"]);

  const certPem = certPick?.text;
  const keyPem = keyPick?.text;

  const hasPemPair = Boolean(certPem && keyPem);
  const hasPfx = Boolean(chosenPfx);

  if (hasPfx && hasPemPair) {
    warnings.push(
      "Archive contains both PFX and PEM. PEM (cert.crt + key.key) will be used for mTLS so a PFX passphrase is not required."
    );
  }

  // Prefer PEM when the bundle includes a cert+key pair, even if a .pfx is present (ZIMRA zips often ship both).
  let tlsReady: "pfx" | "pem" | null = null;
  if (hasPemPair && hasPfx) tlsReady = "pem";
  else if (hasPfx) tlsReady = "pfx";
  else if (hasPemPair) tlsReady = "pem";

  const missing: string[] = [];
  if (!hasPfx && !hasPemPair) {
    if (
      !chosenPfx &&
      certEntries.length === 0 &&
      keyEntries.length === 0 &&
      pfxEntries.length === 0
    ) {
      missing.push(
        "No usable TLS files found. Expected at least one of: .pfx / .p12, or a certificate (.crt / .pem) plus a private key (.key / .pem)."
      );
    } else {
      if (!hasPfx && certPem && !keyPem) {
        missing.push(
          "Private key is missing — add a .key file or a PEM file containing BEGIN PRIVATE KEY / BEGIN RSA PRIVATE KEY."
        );
      }
      if (!hasPfx && keyPem && !certPem) {
        missing.push(
          "Client certificate is missing — add a .crt / .cer or a PEM file containing BEGIN CERTIFICATE."
        );
      }
      if (!hasPfx && !certPem && !keyPem && pfxEntries.length === 0) {
        missing.push("Could not pair certificate and private key from this folder/zip.");
      }
    }
  }

  if (hasPfx && pfxEntries.length > 1) {
    warnings.push(
      `Multiple PFX/P12 files found; using "${basename(chosenPfx!.path)}". Remove extras if this is wrong.`
    );
  }

  if (tlsReady === "pfx" && !opts.pfxPassphrase?.trim()) {
    warnings.push(
      "No PFX passphrase entered. If your .pfx is password-protected, add the passphrase before saving."
    );
  }

  const validationBase: CertBundleValidation = {
    filesScanned,
    usedFiles: [],
    ignored,
    missing,
    warnings,
    tlsReady,
  };

  if (tlsReady === "pfx" && chosenPfx) {
    return {
      validation: {
        ...validationBase,
        usedFiles: [chosenPfx.path],
      },
      storable: true,
      storeAs: "pfx",
      pfxBase64: chosenPfx.content.toString("base64"),
    };
  }

  if (tlsReady === "pem" && certPem && keyPem && certPick && keyPick) {
    return {
      validation: {
        ...validationBase,
        usedFiles: [certPick.path, keyPick.path],
      },
      storable: true,
      storeAs: "pem",
      certPem,
      keyPem,
    };
  }

  return {
    validation: { ...validationBase, usedFiles: [] },
    storable: false,
    storeAs: null,
  };
}
