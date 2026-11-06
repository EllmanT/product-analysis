/**
 * Signer over a PEM private key that may be RSA or ECDSA (P-256). ZIMRA accepts either, and the device
 * certificates issued so far are RSA 2048, so the original ECDSA-only signer is not enough.
 *
 * Gateway v7.2 (13.2.1): the device signature is "SHA256WithRSA over the string, or ECDSA P-256 over the hash".
 * - RSA: PKCS#1 v1.5 signature with SHA-256 over the canonical string.
 * - EC:  ASN.1 DER ECDSA signature with SHA-256 over the canonical string (P1363 is rejected by FDMS).
 * The hash sent alongside is always base64 SHA-256 of the string (see signCanonicalString).
 */
import { createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import type { Signer } from "../core/signer.js";

export type DeviceKeyType = "rsa" | "ec";

export class KeySigner implements Signer {
  private readonly key: KeyObject;
  readonly keyType: DeviceKeyType;
  readonly algorithm: "ecdsa-sha256" | "rsa-sha256";

  constructor(privateKeyPem: string) {
    this.key = createPrivateKey(privateKeyPem);
    const t = this.key.asymmetricKeyType;
    if (t === "rsa") this.keyType = "rsa";
    else if (t === "ec" && this.key.asymmetricKeyDetails?.namedCurve === "prime256v1") this.keyType = "ec";
    else throw new Error(`Unsupported device key type: ${t}${t === "ec" ? ` (${this.key.asymmetricKeyDetails?.namedCurve})` : ""}. Use RSA 2048 or ECC P-256.`);
    this.algorithm = this.keyType === "rsa" ? "rsa-sha256" : "ecdsa-sha256";
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const sig =
      this.keyType === "rsa"
        ? cryptoSign("sha256", data, this.key)
        : cryptoSign("sha256", data, { key: this.key, dsaEncoding: "der" });
    return new Uint8Array(sig);
  }

  async publicKeySpki(): Promise<Uint8Array> {
    return new Uint8Array(createPublicKey(this.key).export({ type: "spki", format: "der" }));
  }
}
