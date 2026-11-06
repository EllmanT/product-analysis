/**
 * Re-register a device with its ACTIVATION KEY (RegisterDevice) and store the new certificate bundle.
 * The key is read from the ACTIVATION_KEY environment variable so it never sits in shell history or a file.
 * ZIMRA test devices must have had their activation reset on the ops portal first.
 *
 *   ACTIVATION_KEY=00000000 npx tsx scripts/register-device.ts "<certificates folder>" <deviceId> <serialNumber> [--key=rsa|ec] [--yes]
 *
 * The new private key is written to pending/ BEFORE anything is sent (a lost reply must not lose it); any old
 * bundle is backed up; the new certificate is verified against the gateway before the files are moved in place.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

import { registerDevice } from "../src/core/registration.js";
import { FdmsClient } from "../src/core/transport.js";
import { assertKeyMatchesCertificate, parseDeviceCertificate } from "../src/devices/cert-info.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [root, idArg, serial] = args;
const yes = flags.includes("--yes");
const keyKind = (flags.find((f) => f.startsWith("--key="))?.split("=")[1] ?? "rsa") as "rsa" | "ec";
const activationKey = process.env.ACTIVATION_KEY;
if (!root || !idArg || !serial || !activationKey || !["rsa", "ec"].includes(keyKind)) {
  console.error('Usage: ACTIVATION_KEY=... npx tsx scripts/register-device.ts "<certs folder>" <deviceId> <serial> [--key=rsa|ec] [--yes]');
  process.exit(2);
}
const deviceId = Number(idArg);
const dir = join(root, `certificates_${deviceId}`);
console.log(`Device ${deviceId} (${serial}): will register a new ${keyKind.toUpperCase()} key into ${dir}`);
if (!yes) {
  console.log("Dry run: nothing was sent. Add --yes to register.");
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
if (existsSync(join(dir, "cert.crt"))) {
  const backup = join(root, "_backup", `certificates_${deviceId}_${stamp}`);
  mkdirSync(backup, { recursive: true });
  for (const f of ["cert.crt", "key.key"]) if (existsSync(join(dir, f))) copyFileSync(join(dir, f), join(backup, f));
  console.log(`Backed up the old pair to ${backup}`);
}
const pending = join(dir, "pending");
mkdirSync(pending, { recursive: true });
const pair = keyKind === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 2048 }) : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const newKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
writeFileSync(join(pending, "key.key"), newKey, { mode: 0o600 });
console.log("New private key saved to pending/ before sending anything.");

const reg = await registerDevice({ deviceId, serialNumber: serial, modelName: "Server", modelVersion: "v1" }, activationKey, new KeySigner(newKey), { environment: "test" });
writeFileSync(join(pending, "cert.crt"), reg.certificatePem);
console.log(`RegisterDevice accepted (operation ${reg.operationId}).`);

const info = parseDeviceCertificate(reg.certificatePem);
assertKeyMatchesCertificate(reg.certificatePem, newKey);
if (info.deviceId !== deviceId) throw new Error("The certificate is for a different device. Nothing replaced; see pending/.");
const client = new FdmsClient({ deviceId, serialNumber: serial, modelName: "Server", modelVersion: "v1" }, new NodeTransport({ certificatePem: reg.certificatePem, privateKeyPem: newKey }), { environment: "test" });
await client.request("GET", `/Device/v1/${deviceId}/GetConfig`);
const st = await client.request<Record<string, unknown>>("GET", `/Device/v1/${deviceId}/GetStatus`);
console.log(`New ${info.keyType.toUpperCase()} certificate works, valid until ${info.notAfter.toISOString()} (${info.daysLeft} days). Fiscal day: ${st["fiscalDayStatus"]} (last day ${st["lastFiscalDayNo"]}).`);

writeFileSync(join(dir, "cert.crt"), reg.certificatePem);
writeFileSync(join(dir, "key.key"), newKey, { mode: 0o600 });
rmSync(pending, { recursive: true, force: true });
console.log("Stored cert.crt and key.key. Done.");
