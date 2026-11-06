/**
 * Entry point. Configuration (environment):
 *   FISCAL_MONGODB_URI        the service's own MongoDB (not the POS app's database)
 *   FISCAL_MONGODB_DB         database name, default "fiscal_service"
 *   FISCAL_SERVICE_TOKEN      shared secret for callers, at least 16 characters
 *   FISCAL_ENCRYPTION_KEY     base64 of 32 random bytes (see src/security/secret-box.ts)
 *   PORT                      default 4100
 */
import { MongoClient } from "mongodb";

import { createGatewayVerifier } from "./devices/gateway-verifier.js";
import { DeviceRegistry } from "./devices/registry.js";
import { SecretBox } from "./security/secret-box.js";
import { AlertStore } from "./engine/alerts.js";
import { EngineManager } from "./engine/manager.js";
import { Scheduler } from "./engine/scheduler.js";
import { createApp } from "./server.js";

const uri = process.env.FISCAL_MONGODB_URI;
const token = process.env.FISCAL_SERVICE_TOKEN;
if (!uri || !token) {
  console.error("FISCAL_MONGODB_URI and FISCAL_SERVICE_TOKEN are required.");
  process.exit(1);
}

const client = await new MongoClient(uri).connect();
const registry = new DeviceRegistry(client.db(process.env.FISCAL_MONGODB_DB || "fiscal_service"), new SecretBox(), createGatewayVerifier());
await registry.init();

const db = client.db(process.env.FISCAL_MONGODB_DB || "fiscal_service");
const alerts = new AlertStore(db);
await alerts.init();
const manager = new EngineManager({
  db,
  registry,
  alert: (a) => {
    console.warn(`[ALERT] ${a.kind} device ${a.deviceKey}: ${a.message}`);
    void alerts.record(a);
  },
});
// Start the engines of every active device so receipts queued before a restart keep being delivered.
const started = await manager.startAll();
console.log(`engines started: ${started.started}${started.failed.length ? `, failed: ${JSON.stringify(started.failed)}` : ""}`);
const stopScheduler = new Scheduler({ registry, manager }).start();

const port = Number(process.env.PORT) || 4100;
const server = createApp({ registry, manager, alerts, token }).listen(port, () => console.log(`fiscal-service listening on ${port}`));

// Clean shutdown gives the device leases back so another instance can start at once.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopScheduler();
    server.close();
    void manager.shutdown().finally(() => process.exit(0));
  });
}
