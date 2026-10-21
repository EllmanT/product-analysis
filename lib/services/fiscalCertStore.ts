import tls from "node:tls";

import { tryExtractDeviceSerialFromCertPem, tryExtractDeviceSerialFromPfx } from "@/lib/fiscalCertSerial";
import { certMatchesKey, parseCertPem, pfxLeafCertPem, type CertInfo } from "@/lib/fiscalCertInfo";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/security/secretBox";
import type { ZimraTlsConfig } from "@/lib/zimraHttp";

/**
 * Certificate material lives on two kinds of document: the central FiscalSettings and each
 * FiscalDevice. Both use these helpers so keys are validated and encrypted the same way.
 */
export interface CertHolder {
  deviceSerialNumber?: string;
  clientCertPem?: string;
  clientKeyPem?: string;
  clientPfxBase64?: string;
  clientPfxPassphrase?: string;
  certSubject?: string;
  certSerial?: string;
  certFingerprint256?: string;
  certNotBefore?: Date;
  certNotAfter?: Date;
  pendingKeyPem?: string;
  pendingCertPem?: string;
}

/**
 * Encryption context per secret. Binding the scope in means one device's ciphertext cannot be
 * pasted onto another device or field. "central" keeps the strings Phase 1 already stored.
 */
export function secretCtx(scope: string) {
  return {
    key: `fiscal:${scope}:clientKeyPem`,
    pfx: `fiscal:${scope}:clientPfxBase64`,
    pass: `fiscal:${scope}:clientPfxPassphrase`,
    pendingKey: `fiscal:${scope}:pendingKeyPem`,
  } as const;
}

export const CENTRAL_SCOPE = "central";
export const deviceScope = (id: string) => `device:${id}`;

export function hasCertificate(h: CertHolder): boolean {
  return Boolean((h.clientCertPem?.trim() && h.clientKeyPem?.trim()) || h.clientPfxBase64?.trim());
}

export function secretsEncrypted(h: CertHolder): boolean {
  return [h.clientKeyPem, h.clientPfxBase64, h.clientPfxPassphrase, h.pendingKeyPem].every((v) => !v?.trim() || isEncrypted(v));
}

/** TLS material for outgoing calls. Decrypts in memory only; PEM wins over PFX when both exist. */
export function tlsFromHolder(h: CertHolder, scope: string): ZimraTlsConfig | null {
  const ctx = secretCtx(scope);
  if (h.clientCertPem?.trim() && h.clientKeyPem?.trim()) {
    return { certPem: h.clientCertPem, keyPem: decryptSecret(h.clientKeyPem, ctx.key) };
  }
  if (h.clientPfxBase64?.trim()) {
    return {
      pfxBase64: decryptSecret(h.clientPfxBase64, ctx.pfx),
      pfxPassphrase: decryptSecret(h.clientPfxPassphrase, ctx.pass),
    };
  }
  return null;
}

export function clearCertMeta(h: CertHolder) {
  h.certSubject = undefined;
  h.certSerial = undefined;
  h.certFingerprint256 = undefined;
  h.certNotBefore = undefined;
  h.certNotAfter = undefined;
}

export function clearPemFrom(h: CertHolder) {
  h.clientCertPem = "";
  h.clientKeyPem = "";
  if (!h.clientPfxBase64?.trim()) clearCertMeta(h);
}

export function clearPfxFrom(h: CertHolder) {
  h.clientPfxBase64 = "";
  h.clientPfxPassphrase = "";
  if (!h.clientCertPem?.trim()) clearCertMeta(h);
}

function applyMeta(h: CertHolder, certPem: string): CertInfo {
  const info = parseCertPem(certPem);
  if (info.notAfter.getTime() <= Date.now()) {
    throw new Error(
      `This certificate expired on ${info.notAfter.toISOString().slice(0, 10)}. ZIMRA rejects expired certificates; upload a current one.`
    );
  }
  h.certSubject = info.subject;
  h.certSerial = info.serial;
  h.certFingerprint256 = info.fingerprint256;
  h.certNotBefore = info.notBefore;
  h.certNotAfter = info.notAfter;
  return info;
}

/** Validate and store a PEM pair on `h`. Throws before changing anything if it is not usable. */
export function applyPem(h: CertHolder, certPem: string, keyPem: string, scope: string): CertInfo {
  if (!certPem.includes("BEGIN CERTIFICATE")) throw new Error("The certificate file is not a PEM certificate.");
  if (!/BEGIN (?:[A-Z]+ )?PRIVATE KEY/.test(keyPem)) throw new Error("The key file is not a PEM private key.");
  if (!certMatchesKey(certPem, keyPem)) {
    throw new Error("The private key does not belong to this certificate. Upload the matching pair.");
  }
  // Encrypt first: a missing master key aborts here with nothing modified.
  const encKey = encryptSecret(keyPem, secretCtx(scope).key);
  const info = applyMeta(h, certPem);
  h.clientCertPem = certPem;
  h.clientKeyPem = encKey;
  h.clientPfxBase64 = "";
  h.clientPfxPassphrase = "";
  const serial = tryExtractDeviceSerialFromCertPem(certPem);
  if (serial) h.deviceSerialNumber = serial;
  return info;
}

/** Validate and store a PFX on `h`. Throws before changing anything if it is not usable. */
export function applyPfx(h: CertHolder, base64: string, passphrase: string, scope: string): CertInfo {
  const pfxBuf = Buffer.from(base64, "base64");
  try {
    tls.createSecureContext({ pfx: pfxBuf, ...(passphrase ? { passphrase } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/mac verify|bad decrypt|pkcs12|invalid password/i.test(msg)) {
      throw new Error("PFX could not be loaded (wrong passphrase or bad file). Re-enter the password or export a new PFX.");
    }
    throw e;
  }
  const leafPem = pfxLeafCertPem(pfxBuf, passphrase);
  if (!leafPem) throw new Error("Could not read a certificate from this PFX.");
  const ctx = secretCtx(scope);
  const encPfx = encryptSecret(base64, ctx.pfx);
  const encPass = encryptSecret(passphrase, ctx.pass);
  const info = applyMeta(h, leafPem);
  h.clientPfxBase64 = encPfx;
  h.clientPfxPassphrase = encPass;
  h.clientCertPem = "";
  h.clientKeyPem = "";
  const serial = tryExtractDeviceSerialFromPfx(pfxBuf, passphrase);
  if (serial) h.deviceSerialNumber = serial;
  return info;
}

/** Expiry of the stored certificate; reads it from the certificate itself when never parsed. */
export function ensureCertMeta(h: CertHolder, scope: string): boolean {
  if (!hasCertificate(h) || h.certNotAfter) return false;
  const ctx = secretCtx(scope);
  const pem = h.clientCertPem?.trim()
    ? h.clientCertPem
    : pfxLeafCertPem(
        Buffer.from(decryptSecret(h.clientPfxBase64, ctx.pfx), "base64"),
        decryptSecret(h.clientPfxPassphrase, ctx.pass)
      );
  if (!pem) return false;
  const info = parseCertPem(pem);
  h.certSubject = info.subject;
  h.certSerial = info.serial;
  h.certFingerprint256 = info.fingerprint256;
  h.certNotBefore = info.notBefore;
  h.certNotAfter = info.notAfter;
  return true;
}
