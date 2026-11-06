/**
 * Adds real certificate bundles to a throw-away registry using the REAL gateway verifier (GetConfig only,
 * read-only) to show that "upload certificate and key" is all a device needs.
 *   npx tsx scripts/live-add-check.ts "<certificates folder>" <deviceId> [deviceId ...]
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";

import { createGatewayVerifier } from "../src/devices/gateway-verifier.js";
import { DeviceRegistry } from "../src/devices/registry.js";
import { SecretBox } from "../src/security/secret-box.js";

const [root, ...ids] = process.argv.slice(2);
if (!root || !ids.length) {
  console.error('Usage: live-add-check.ts "<certificates folder>" <deviceId> ...');
  process.exit(2);
}
const client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/").connect();
const db = client.db(`fiscal_service_live_${randomBytes(4).toString("hex")}`);
try {
  const registry = new DeviceRegistry(db, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), createGatewayVerifier());
  await registry.init();
  for (const id of ids) {
    const dir = join(root, `certificates_${id}`);
    try {
      const d = await registry.add({
        tenantId: "company-1",
        name: `Device ${id}`,
        certificatePem: readFileSync(join(dir, "cert.crt"), "utf-8"),
        privateKeyPem: readFileSync(join(dir, "key.key"), "utf-8"),
      });
      console.log(`added ${d.deviceId} ${d.serialNumber} ${d.keyType.toUpperCase()} ${d.certDaysLeft} days left, taxpayer ${d.taxPayerName}, mode ${d.operatingMode}`);
    } catch (e) {
      console.log(`refused ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
} finally {
  await db.dropDatabase();
  await client.close();
}
