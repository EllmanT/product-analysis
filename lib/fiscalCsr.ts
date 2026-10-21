import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";

/**
 * ZIMRA ties a device certificate to its identity through the subject CN:
 *   ZIMRA-<fiscal device serial>-<device ID zero-padded to 10 digits>
 * e.g. ZIMRA-VR-C182CEFC01FEE2FB-0000031591.
 */
export function deviceCommonName(serial: string, deviceId: string | number): string {
  return `ZIMRA-${serial}-${String(deviceId).padStart(10, "0")}`;
}

/** Read the serial and device ID back out of a certificate subject; null if it is not in ZIMRA's format. */
export function parseDeviceCommonName(subject: string): { serial: string; deviceId: string } | null {
  const cn = /CN=([^,\n]+)/.exec(subject)?.[1]?.trim();
  const m = cn ? /^ZIMRA-(.+)-(\d{10})$/.exec(cn) : null;
  return m ? { serial: m[1], deviceId: String(Number(m[2])) } : null;
}

/**
 * New RSA 2048 key and a CSR signed with SHA-256, in the shape ZIMRA's registerDevice / issueCertificate
 * accept (CN as above; other subject fields, if present, must be C=ZW, O=Zimbabwe Revenue Authority,
 * ST=Zimbabwe). ECC secp256r1 is ZIMRA's preferred type but RSA 2048 is accepted, and the existing
 * devices use RSA. The private key never leaves the server and is returned only to be stored encrypted.
 */
export function generateCsr(serial: string, deviceId: string | number): { csrPem: string; keyPem: string } {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const key = forge.pki.privateKeyFromPem(keyPem);

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  csr.setSubject([
    { name: "countryName", value: "ZW" },
    { shortName: "ST", value: "Zimbabwe" },
    { name: "organizationName", value: "Zimbabwe Revenue Authority" },
    { name: "commonName", value: deviceCommonName(serial, deviceId) },
  ]);
  csr.sign(key, forge.md.sha256.create());
  if (!csr.verify()) throw new Error("Generated CSR failed self-verification");
  return { csrPem: forge.pki.certificationRequestToPem(csr), keyPem };
}
