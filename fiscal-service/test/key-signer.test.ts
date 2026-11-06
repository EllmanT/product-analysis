import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildCsr, deviceCommonName } from "../src/core/csr.js";

import { signCanonicalString } from "../src/core/signer.js";
import { fromBase64, utf8Bytes } from "../src/core/bytes.js";
import { sha256Base64 } from "../src/core/sha256.js";
import { KeySigner } from "../src/node/key-signer.js";
import { assertKeyMatchesCertificate, parseDeviceCertificate, CertError } from "../src/devices/cert-info.js";

// The worked example in Gateway v7.2 section 13.2.1: the string the device signs.
const SPEC_EXAMPLE = "321FISCALINVOICEZWL4322019-09-19T15:43:12945000A0250000B0.000350000C15.0015000115000D15.0030000230000";

describe("KeySigner", () => {
  it("signs with RSA (SHA256WithRSA) and the signature verifies with the public key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signer = new KeySigner(privateKey.export({ type: "pkcs8", format: "pem" }) as string);
    assert.equal(signer.keyType, "rsa");
    const sd = await signCanonicalString(signer, SPEC_EXAMPLE);
    assert.equal(sd.hash, sha256Base64(SPEC_EXAMPLE), "the hash is base64 SHA-256 of the string");
    assert.ok(verify("sha256", utf8Bytes(SPEC_EXAMPLE), publicKey, fromBase64(sd.signature)), "RSA signature verifies");
    assert.equal(fromBase64(sd.signature).length, 256, "a 2048-bit RSA signature is 256 bytes");
  });

  it("signs with ECDSA P-256 as DER and the signature verifies", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const signer = new KeySigner(privateKey.export({ type: "pkcs8", format: "pem" }) as string);
    assert.equal(signer.keyType, "ec");
    const sd = await signCanonicalString(signer, SPEC_EXAMPLE);
    const sig = fromBase64(sd.signature);
    assert.equal(sig[0], 0x30, "DER sequence, not raw r||s");
    assert.ok(verify("sha256", utf8Bytes(SPEC_EXAMPLE), { key: publicKey, dsaEncoding: "der" }, sig));
  });

  it("refuses other key types and curves", () => {
    const ed = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    assert.throws(() => new KeySigner(ed), /Unsupported device key type/);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    assert.throws(() => new KeySigner(p384), /Unsupported device key type/);
  });

  it("exposes the public key as SPKI for building CSRs", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signer = new KeySigner(privateKey.export({ type: "pkcs8", format: "pem" }) as string);
    const spki = Buffer.from(await signer.publicKeySpki());
    assert.deepEqual(spki, publicKey.export({ type: "spki", format: "der" }));
  });
});

describe("device certificate reading", () => {
  const dir = new URL("../../test certificates/certificates_28892/", import.meta.url);
  const certPath = new URL("cert.crt", dir);
  const keyPath = new URL("key.key", dir);
  const have = existsSync(certPath) && existsSync(keyPath);

  it("reads device id, serial, key type and expiry from a real device certificate", { skip: !have }, () => {
    const now = new Date("2026-10-25T00:00:00Z");
    const info = parseDeviceCertificate(readFileSync(certPath, "utf-8"), now);
    assert.equal(info.deviceId, 28892);
    assert.equal(info.serialNumber, "VR-D6409ABB3D893936");
    assert.equal(info.keyType, "rsa");
    // Renewed on 2026-10-25 for about six months.
    assert.equal(info.daysLeft, Math.floor((info.notAfter.getTime() - now.getTime()) / 86_400_000));
    assert.ok(info.notAfter > new Date("2027-01-01T00:00:00Z"));
  });

  it("accepts the matching key and rejects a different one", { skip: !have }, () => {
    const cert = readFileSync(certPath, "utf-8");
    assertKeyMatchesCertificate(cert, readFileSync(keyPath, "utf-8"));
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    assert.throws(() => assertKeyMatchesCertificate(cert, other), CertError);
  });

  it("rejects a certificate that is not a ZIMRA device certificate", () => {
    assert.throws(() => parseDeviceCertificate("not a certificate"), CertError);
  });
});

describe("CSR building", () => {
  const openssl = spawnSync("openssl", ["version"]);
  const have = openssl.status === 0;

  for (const kind of ["rsa", "ec"] as const) {
    it(`builds a ${kind.toUpperCase()} CSR that OpenSSL verifies, with the ZIMRA common name`, { skip: !have }, async () => {
      const pair = kind === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 2048 }) : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const signer = new KeySigner(pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string);
      const csr = await buildCsr(signer, deviceCommonName("VR-TEST000000000001", 28892));
      const res = spawnSync("openssl", ["req", "-verify", "-noout", "-subject"], { input: csr, encoding: "utf-8" });
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stderr + res.stdout, /verify OK/);
      assert.match(res.stdout, /CN\s*=\s*ZIMRA-VR-TEST000000000001-0000028892/);
    });
  }
});

describe("fiscal time zone", () => {
  it("formats ZIMRA dates in Zimbabwe time whatever the machine's zone", async () => {
    const { fdmsDateTime, fdmsDate } = await import("../src/core/signing.js");
    const { receiptQrData } = await import("../src/core/qr.js");
    const d = new Date("2026-10-25T22:30:05Z"); // 00:30:05 on the 26th in Harare (UTC+2)
    assert.equal(fdmsDateTime(d), "2026-10-26T00:30:05");
    assert.equal(fdmsDate(d), "2026-10-26");
    const qr = receiptQrData({ qrUrl: "https://x.test", deviceId: 28892, receiptDate: d, receiptGlobalNo: 7, deviceSignatureBase64: "AAAA" });
    assert.match(qr, /^https:\/\/x\.test\/0000028892261020260000000007/);
  });
});

describe("parsing a zone-less FDMS date-time", () => {
  it("round-trips through the fiscal zone from any machine zone", async () => {
    const { parseFdmsDateTime } = await import("../src/core/time.js");
    const { fdmsDateTime } = await import("../src/core/signing.js");
    for (const t of ["2026-10-25T14:30:05", "2026-01-01T00:00:00", "2026-12-31T23:59:59", "2026-03-29T02:30:00"]) {
      assert.equal(fdmsDateTime(parseFdmsDateTime(t)), t);
    }
    assert.equal(parseFdmsDateTime("2026-10-25T14:30:05").toISOString(), "2026-10-25T12:30:05.000Z");
  });
});
