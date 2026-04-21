import { X509Certificate } from "node:crypto";
import forge from "node-forge";

/**
 * Read device / taxpayer serial-style values from a client certificate PEM when present.
 * Prefers explicit subject serialNumber=… (common on device certs), else X.509 serialNumber.
 */
export function tryExtractDeviceSerialFromCertPem(certPem: string): string | null {
  const trimmed = certPem.trim();
  if (!trimmed.includes("BEGIN CERTIFICATE")) return null;
  try {
    const cert = new X509Certificate(trimmed);
    const subj = cert.subject || "";
    const fromDn = /serialNumber=([^,\n/]+)/i.exec(subj);
    if (fromDn?.[1]?.trim()) {
      return fromDn[1].trim();
    }
    const hex = cert.serialNumber?.replace(/:/g, "").trim();
    if (hex) return hex.toUpperCase();
  } catch {
    return null;
  }
  return null;
}

function pfxToFirstCertPem(pfx: Buffer, passphrase: string): string | null {
  const tryPass = (pass: string): string | null => {
    try {
      const asn1 = forge.asn1.fromDer(pfx.toString("binary"));
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, pass || "");
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
      const first = bags?.[0]?.cert;
      if (!first) return null;
      return forge.pki.certificateToPem(first);
    } catch {
      return null;
    }
  };
  return tryPass(passphrase) ?? tryPass("");
}

export function tryExtractDeviceSerialFromPfx(pfx: Buffer, passphrase: string): string | null {
  const pem = pfxToFirstCertPem(pfx, passphrase);
  if (!pem) return null;
  return tryExtractDeviceSerialFromCertPem(pem);
}
