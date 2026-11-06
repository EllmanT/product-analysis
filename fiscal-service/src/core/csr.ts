/**
 * PKCS#10 certificate request built from a Signer, so a key that can never
 * leave the Android Keystore or an HSM can still register a device.
 */
import { derBitString, derContext, derOid, derSequence, derSet, derString, derInteger } from "./asn1.js";
import { derToPem } from "./bytes.js";
import type { Signer } from "./signer.js";

const OID_COMMON_NAME = "2.5.4.3";
const OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";
const OID_RSA_SHA256 = "1.2.840.113549.1.1.11";
/** ASN.1 NULL, the parameters field of sha256WithRSAEncryption. */
const DER_NULL = new Uint8Array([0x05, 0x00]);

/**
 * Device name required by FDMS in the CSR subject CN:
 * [CLIENT]-[serial]-[zero-padded 10-digit deviceId], e.g. ZIMRA-GOKOSDK001-0000037367
 */
export function deviceCommonName(
  serialNumber: string,
  deviceId: number,
  client = "ZIMRA",
): string {
  return `${client}-${serialNumber}-${String(deviceId).padStart(10, "0")}`;
}

/**
 * Build and sign a CSR in the format FDMS expects: ECC secp256r1 with ecdsa-with-SHA256, or RSA 2048
 * with sha256WithRSAEncryption (chosen by the signer), a single CN in the subject, no attributes.
 */
export async function buildCsr(signer: Signer, commonName: string): Promise<string> {
  const spki = await signer.publicKeySpki();

  const info = derSequence(
    derInteger(0),
    derSequence(derSet(derSequence(derOid(OID_COMMON_NAME), derString(commonName)))),
    spki,
    derContext(0, new Uint8Array(0)),
  );

  const signature = await signer.sign(info);
  const algorithm =
    signer.algorithm === "rsa-sha256"
      ? derSequence(derOid(OID_RSA_SHA256), DER_NULL)
      : derSequence(derOid(OID_ECDSA_SHA256));
  const csr = derSequence(info, algorithm, derBitString(signature));
  return derToPem(csr, "CERTIFICATE REQUEST");
}
