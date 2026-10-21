import { X509Certificate, createPrivateKey } from "node:crypto";
import forge from "node-forge";

export type CertInfo = {
  subject: string;
  serial: string;
  fingerprint256: string;
  notBefore: Date;
  notAfter: Date;
};

/** Parse the first certificate in a PEM string. Throws if it is not a valid X.509 certificate. */
export function parseCertPem(certPem: string): CertInfo {
  const c = new X509Certificate(certPem.trim());
  return {
    subject: c.subject.replace(/\n/g, ", "),
    serial: c.serialNumber.replace(/:/g, "").toUpperCase(),
    fingerprint256: c.fingerprint256,
    notBefore: new Date(c.validFrom),
    notAfter: new Date(c.validTo),
  };
}

/** True when the private key belongs to the certificate. Never logs or returns key material. */
export function certMatchesKey(certPem: string, keyPem: string): boolean {
  try {
    return new X509Certificate(certPem.trim()).checkPrivateKey(createPrivateKey(keyPem.trim()));
  } catch {
    return false;
  }
}

/**
 * Device certificate inside a PFX, as PEM. Pairing with the key is checked separately by
 * tls.createSecureContext (it also handles EC keys, which node-forge cannot parse).
 */
export function pfxLeafCertPem(pfx: Buffer, passphrase: string): string | null {
  const attempt = (pass: string) => {
    try {
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString("binary")), pass);
      const certs =
        p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.flatMap((b) => (b.cert ? [b.cert] : [])) ?? [];
      if (!certs.length) return null;
      const leaf =
        certs.find((c) => (c.subject.getField("CN")?.value as string | undefined)?.startsWith("ZIMRA-")) ?? certs[0];
      return forge.pki.certificateToPem(leaf);
    } catch {
      return null;
    }
  };
  return attempt(passphrase) ?? attempt("");
}

export type CertExpiryStatus = "ok" | "warning" | "critical" | "expired" | "unknown";

export type CertExpiry = {
  status: CertExpiryStatus;
  /** Whole days left; negative once expired. Null when unknown. */
  daysLeft: number | null;
  notAfter: Date | null;
};

/** ZIMRA recommends renewing a month before expiry; warn earlier so there is time to act. */
export const CERT_WARN_DAYS = 60;
export const CERT_CRITICAL_DAYS = 30;

export function evaluateExpiry(notAfter: Date | null | undefined, now = new Date()): CertExpiry {
  if (!notAfter || Number.isNaN(notAfter.getTime())) return { status: "unknown", daysLeft: null, notAfter: null };
  const daysLeft = Math.floor((notAfter.getTime() - now.getTime()) / 86_400_000);
  const status: CertExpiryStatus =
    notAfter.getTime() <= now.getTime()
      ? "expired"
      : daysLeft <= CERT_CRITICAL_DAYS
        ? "critical"
        : daysLeft <= CERT_WARN_DAYS
          ? "warning"
          : "ok";
  return { status, daysLeft, notAfter };
}
