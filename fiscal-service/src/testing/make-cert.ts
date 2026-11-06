/**
 * Throw-away ZIMRA-style device certificates for tests: self-signed, subject CN `ZIMRA-<serial>-<10 digit id>`,
 * RSA 2048 or ECC P-256. Uses the openssl command line, which every dev machine and CI image has.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestBundle {
  deviceId: number;
  serialNumber: string;
  certificatePem: string;
  privateKeyPem: string;
  keyType: "rsa" | "ec";
}

export function opensslAvailable(): boolean {
  return spawnSync("openssl", ["version"]).status === 0;
}

export function makeDeviceBundle(deviceId: number, keyType: "rsa" | "ec" = "rsa", daysValid = 180): TestBundle {
  const serialNumber = `VR-TEST${String(deviceId).padStart(9, "0")}`;
  const dir = mkdtempSync(join(tmpdir(), "fiscal-cert-"));
  try {
    const args = [
      "req", "-x509", "-nodes", "-days", String(daysValid),
      ...(keyType === "rsa" ? ["-newkey", "rsa:2048"] : ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1"]),
      "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
      "-subj", `/C=ZW/O=Zimbabwe Revenue Authority/CN=ZIMRA-${serialNumber}-${String(deviceId).padStart(10, "0")}`,
    ];
    const r = spawnSync("openssl", args, { encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`openssl failed: ${r.stderr}`);
    return {
      deviceId,
      serialNumber,
      certificatePem: readFileSync(join(dir, "cert.pem"), "utf-8"),
      privateKeyPem: readFileSync(join(dir, "key.pem"), "utf-8"),
      keyType,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
