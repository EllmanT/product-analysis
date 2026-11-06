/**
 * Renew a device certificate (IssueCertificate). ZIMRA REVOKES THE OLD CERTIFICATE AT ONCE, so anything else
 * holding the old copy stops working. Without --yes this only prints what it would do.
 *
 *   npm run renew -- "<certificates folder>" <deviceId> [--key=rsa|ec] [--yes]
 *
 * Safety order: check the current pair works, back it up, write the NEW private key to pending/ before
 * anything is sent (a lost reply must not lose the key), request the certificate, verify it matches the
 * new key and lasts longer, test it against the gateway, and only then replace the files.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

import { buildCsr, deviceCommonName } from "../src/core/csr.js";
import { FdmsClient } from "../src/core/transport.js";
import { assertKeyMatchesCertificate, parseDeviceCertificate } from "../src/devices/cert-info.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [root, idArg] = args;
const yes = flags.includes("--yes");
const keyKind = (flags.find((f) => f.startsWith("--key="))?.split("=")[1] ?? "rsa") as "rsa" | "ec";
if (!root || !idArg || !["rsa", "ec"].includes(keyKind)) {
  console.error('Usage: npm run renew -- "<certificates folder>" <deviceId> [--key=rsa|ec] [--yes]');
  process.exit(2);
}

const dir = join(root, `certificates_${idArg}`);
const clientFor = (certificatePem: string, privateKeyPem: string, deviceId: number, serial: string) =>
  new FdmsClient(
    { deviceId, serialNumber: serial, modelName: "Server", modelVersion: "v1" },
    new NodeTransport({ certificatePem, privateKeyPem }),
    { environment: "test" },
  );

const oldCert = readFileSync(join(dir, "cert.crt"), "utf-8");
const oldKey = readFileSync(join(dir, "key.key"), "utf-8");
const info = parseDeviceCertificate(oldCert);
assertKeyMatchesCertificate(oldCert, oldKey);
console.log(`Device ${info.deviceId} (${info.serialNumber}), ${info.keyType.toUpperCase()} certificate valid until ${info.notAfter.toISOString()} (${info.daysLeft} days).`);
console.log(`Will request a new ${keyKind.toUpperCase()} certificate. ZIMRA revokes the old one immediately.`);
if (!yes) {
  console.log("Dry run: nothing was sent. Add --yes to renew.");
  process.exit(0);
}

const current = clientFor(oldCert, oldKey, info.deviceId, info.serialNumber);
await current.request("GET", `/Device/v1/${info.deviceId}/GetConfig`); // throws if the current pair is already dead
console.log("Current certificate works.");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(root, "_backup", `certificates_${info.deviceId}_${stamp}`);
mkdirSync(backup, { recursive: true });
for (const f of ["cert.crt", "key.key"]) copyFileSync(join(dir, f), join(backup, f));
console.log(`Backed up the old pair to ${backup}`);

const pending = join(dir, "pending");
mkdirSync(pending, { recursive: true });
const pair =
  keyKind === "rsa"
    ? generateKeyPairSync("rsa", { modulusLength: 2048 })
    : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const newKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
writeFileSync(join(pending, "key.key"), newKey, { mode: 0o600 });
console.log("New private key saved to pending/ before sending anything.");

const csr = await buildCsr(new KeySigner(newKey), deviceCommonName(info.serialNumber, info.deviceId));
writeFileSync(join(pending, "request.csr"), csr);
const res = await current.request<{ operationID: string; certificate: string }>("POST", `/Device/v1/${info.deviceId}/IssueCertificate`, {
  certificateRequest: csr,
});
const newCert = res.certificate;
writeFileSync(join(pending, "cert.crt"), newCert);
console.log(`IssueCertificate accepted (operation ${res.operationID}).`);

const newInfo = parseDeviceCertificate(newCert);
assertKeyMatchesCertificate(newCert, newKey);
if (newInfo.deviceId !== info.deviceId) throw new Error("The new certificate is for a different device. Nothing replaced; see pending/.");
if (newInfo.notAfter <= info.notAfter) throw new Error("The new certificate does not last longer. Nothing replaced; see pending/.");
const fresh = clientFor(newCert, newKey, info.deviceId, info.serialNumber);
await fresh.request("GET", `/Device/v1/${info.deviceId}/GetConfig`);
console.log(`New ${newInfo.keyType.toUpperCase()} certificate works, valid until ${newInfo.notAfter.toISOString()} (${newInfo.daysLeft} days).`);

writeFileSync(join(dir, "cert.crt"), newCert);
writeFileSync(join(dir, "key.key"), newKey, { mode: 0o600 });
for (const f of ["cert.crt", "key.key", "request.csr"]) if (existsSync(join(pending, f))) renameSync(join(pending, f), join(backup, `new-${f}`));
rmSync(pending, { recursive: true, force: true });
console.log("Replaced the files. Done.");
