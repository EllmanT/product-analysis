/**
 * Reading a device certificate. Adding a device is "upload the certificate and key": everything the
 * service needs about the device identity comes from the certificate itself, and the key is checked
 * against it before anything is stored.
 *
 * ZIMRA device certificates have the subject CN `ZIMRA-<serial>-<10 digit zero padded deviceID>`.
 */
import { X509Certificate, createPrivateKey } from "node:crypto";

export interface DeviceCertInfo {
  deviceId: number;
  serialNumber: string;
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  keyType: "rsa" | "ec";
  /** Whole days until the certificate expires (negative once expired). */
  daysLeft: number;
}

export class CertError extends Error {}

const CN_RE = /^ZIMRA-(.+)-(\d{10})$/;

export function parseDeviceCertificate(certPem: string, now: Date = new Date()): DeviceCertInfo {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    throw new CertError("That is not a readable PEM certificate.");
  }
  const cn = /(?:^|\n)CN=([^\n]+)/.exec(cert.subject)?.[1]?.trim() ?? "";
  const m = CN_RE.exec(cn);
  if (!m) throw new CertError(`The certificate subject "${cn || cert.subject}" is not a ZIMRA device certificate (expected CN=ZIMRA-<serial>-<device id>).`);
  const t = cert.publicKey.asymmetricKeyType;
  if (t !== "rsa" && t !== "ec") throw new CertError(`Unsupported key type in certificate: ${t}`);
  const notAfter = new Date(cert.validTo);
  return {
    deviceId: Number(m[2]),
    serialNumber: m[1]!,
    commonName: cn,
    notBefore: new Date(cert.validFrom),
    notAfter,
    keyType: t,
    daysLeft: Math.floor((notAfter.getTime() - now.getTime()) / 86_400_000),
  };
}

/** Throws unless the private key belongs to the certificate. */
export function assertKeyMatchesCertificate(certPem: string, keyPem: string): void {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    throw new CertError("That is not a readable PEM certificate.");
  }
  let key;
  try {
    key = createPrivateKey(keyPem);
  } catch {
    throw new CertError("That is not a readable PEM private key (PKCS#8 or PKCS#1, unencrypted).");
  }
  if (!cert.checkPrivateKey(key)) throw new CertError("The private key does not match the certificate.");
}
