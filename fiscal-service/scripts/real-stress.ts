/**
 * Runs the real engine against REAL ZIMRA test devices, with the connection broken on purpose (ChaoticTransport).
 * Only use devices whose fiscal day is CLOSED and clean: it opens a day, sells, then closes it. Anything that
 * ends in a Red/Gray receipt makes the real day unclosable, so the run stops at the first one and says so.
 *
 *   npx tsx scripts/real-stress.ts "<certs dir>" <id[,id...]> [--sales=60] [--concurrency=8] [--seed=3] [--no-chaos] [--yes]
 *
 * Needs MongoDB (FISCAL_TEST_MONGODB_URI, default localhost). Output: test-output/real-stress-<time>/ with a
 * summary.md, one JSON per receipt, and the engine events. Without --yes it only checks the devices and stops.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { MongoClient } from "mongodb";

import { parseDeviceCertificate } from "../src/devices/cert-info.js";
import { DeviceEngine, type Alert } from "../src/engine/engine.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";
import { FiscalDevice } from "../src/core/device.js";
import { MemoryStorage } from "../src/core/storage.js";
import { ChaoticTransport } from "../src/testing/chaotic-transport.js";

const argv = process.argv.slice(2);
const [root, idList] = argv.filter((a) => !a.startsWith("--"));
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
if (!root || !idList) {
  console.error('Usage: real-stress.ts "<certs dir>" <id[,id...]> [--sales=60] [--concurrency=8] [--seed=3] [--no-chaos] [--yes]');
  process.exit(2);
}
const salesTotal = Number(flag("sales") ?? 60);
const concurrency = Number(flag("concurrency") ?? 8);
let seedState = Number(flag("seed") ?? 3);
const rand = () => ((seedState = (seedState * 16807) % 2147483647) / 2147483647);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const chaosOn = !argv.includes("--no-chaos");

interface Real {
  deviceId: number;
  serialNumber: string;
  privateKeyPem: string;
  certificatePem: string;
  chaos: ChaoticTransport;
  engine?: DeviceEngine;
}
const devices: Real[] = [];
for (const id of idList.split(",")) {
  const dir = join(root, `certificates_${id.trim()}`);
  const certificatePem = readFileSync(join(dir, "cert.crt"), "utf-8");
  const privateKeyPem = readFileSync(join(dir, "key.key"), "utf-8");
  const info = parseDeviceCertificate(certificatePem);
  const inner = new NodeTransport({ certificatePem, privateKeyPem });
  devices.push({ deviceId: info.deviceId, serialNumber: info.serialNumber, privateKeyPem, certificatePem, chaos: new ChaoticTransport(inner, rand) });
}

// 1. Pre-flight: every device must be closed and clean, otherwise we would only make a stuck device worse.
let blocked = false;
for (const d of devices) {
  const probe = new FiscalDevice(
    { deviceId: d.deviceId, serialNumber: d.serialNumber, modelName: "Server", modelVersion: "v1" },
    { signer: new KeySigner(d.privateKeyPem), transport: new NodeTransport({ certificatePem: d.certificatePem, privateKeyPem: d.privateKeyPem }), storage: new MemoryStorage() },
    { environment: "test", retries: 1 }
  );
  try {
    const s = await probe.getStatus();
    const clean = s.fiscalDayStatus === "FiscalDayClosed";
    console.log(`Device ${d.deviceId}: ${s.fiscalDayStatus}${s.fiscalDayClosingErrorCode ? ` (${s.fiscalDayClosingErrorCode})` : ""}, last day ${s.lastFiscalDayNo}, last receipt no ${s.lastReceiptGlobalNo} -> ${clean ? "usable" : "NOT usable"}`);
    if (!clean) blocked = true;
  } catch (e) {
    console.log(`Device ${d.deviceId}: ${e instanceof Error ? e.message : e} -> NOT usable`);
    blocked = true;
  }
}
if (blocked) {
  console.error("\nAt least one device is not closed and clean. Remove it from the list (or close it) and run again.");
  process.exit(1);
}
if (!argv.includes("--yes")) {
  console.log("\nAll devices are usable. Run again with --yes to open a day on each, sell and close.");
  process.exit(0);
}

// 2. Engines on a throwaway database.
const out = resolve("test-output", `real-stress-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(join(out, "receipts"), { recursive: true });
const events: string[] = [];
const ev = (m: string) => {
  events.push(`${new Date().toISOString()} ${m}`);
  console.log(m);
};
const alerts: Alert[] = [];
const client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/").connect();
const db = client.db(`fiscal_real_${randomBytes(4).toString("hex")}`);

for (const d of devices) {
  d.engine = new DeviceEngine({
    db,
    deviceKey: `real-${d.deviceId}`,
    identity: { deviceId: d.deviceId, serialNumber: d.serialNumber, privateKeyPem: d.privateKeyPem },
    transport: d.chaos,
    environment: "test",
    options: { waitMs: 8_000, retryBaseMs: 500, retryMaxMs: 4_000, openGapMs: 4_000, onRed: "pause", drainTimeoutMs: 180_000, maxDateDriftMs: 270_000, busyWaitMs: 60_000 },
    alert: (a) => {
      alerts.push(a);
      ev(`ALERT ${a.kind} ${a.deviceKey}: ${a.message}`);
    },
  });
  await d.engine.init();
  const opened = await d.engine.openDay();
  ev(`device ${d.deviceId}: day opened (${JSON.stringify(opened)})`);
  d.engine.startBackground(500);
}
await sleep(5_000);

// 3. Load. Real receipts must be at least ~1 s apart per device, so the pace is limited by the devices, not us.
const items = [["Bread", "1.50"], ["Milk 1L", "2.20"], ["Sugar 2kg", "3.40"], ["Rice 5kg", "6.80"], ["Soap", "0.90"]] as const;
const sales = Array.from({ length: salesTotal }, (_, i) => {
  const d = devices[i % devices.length]!;
  const [name, price] = items[Math.floor(rand() * items.length)]!;
  const qty = 1 + Math.floor(rand() * 3);
  const total = (Number(price) * qty).toFixed(2);
  return {
    d,
    req: {
      tenantId: "company-1",
      invoiceNo: `RS-${d.deviceId}-${Date.now().toString(36)}-${String(i).padStart(4, "0")}`,
      currency: "USD",
      lines: [{ name, unitPrice: price, quantity: qty, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }],
      payments: [{ moneyType: "Cash" as const, amount: total }],
    },
    result: undefined as Awaited<ReturnType<DeviceEngine["submit"]>> | undefined,
  };
});

// Chaos timeline by progress: lost replies throughout, an outage on one device mid-run, then a global one.
let done = 0;
const phase = new Set<string>();
function chaos() {
  if (!chaosOn) return;
  const pct = (done / salesTotal) * 100;
  const on = (k: string, cond: boolean, enter: () => void, leave: () => void, msg: string) => {
    if (cond && !phase.has(k)) {
      phase.add(k);
      enter();
      ev(`CHAOS ${msg} on at ${pct.toFixed(0)}%`);
    } else if (!cond && phase.has(k)) {
      phase.delete(k);
      leave();
      ev(`CHAOS ${msg} off at ${pct.toFixed(0)}%`);
    }
  };
  for (const d of devices) d.chaos.faults.only = /SubmitReceipt/;
  on("lost", pct >= 15 && pct < 60, () => devices.forEach((d) => (d.chaos.faults.dropReplyRate = 0.25)), () => devices.forEach((d) => (d.chaos.faults.dropReplyRate = 0)), "lost replies 25%");
  on("one", pct >= 30 && pct < 50, () => (devices[0]!.chaos.faults.outage = true), () => (devices[0]!.chaos.faults.outage = false), `outage on device ${devices[0]!.deviceId}`);
  on("all", pct >= 65 && pct < 80, () => devices.forEach((d) => (d.chaos.faults.outage = true)), () => devices.forEach((d) => (d.chaos.faults.outage = false)), "outage on every device");
}
let next = 0;
const t0 = Date.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (;;) {
      const i = next++;
      if (i >= sales.length) return;
      chaos();
      const s = sales[i]!;
      s.result = await s.d.engine!.submit(s.req);
      done++;
    }
  })
);
ev(`load finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 4. Heal everything, drain, check against ZIMRA, close.
for (const d of devices) {
  Object.assign(d.chaos.faults, { outage: false, dropReplyRate: 0, dropRequestRate: 0, dropRepliesNext: 0, latencyMs: 0, jitterMs: 0 });
  d.engine!.kick();
}
const drainEnd = Date.now() + 240_000;
for (;;) {
  const left = (await Promise.all(devices.map((d) => d.engine!.status()))).reduce((s, x) => s + x.unsent, 0);
  if (left === 0 || Date.now() > drainEnd) break;
  await sleep(500);
}
const summary: string[] = [`# Real-gateway stress run`, ``, `${salesTotal} sales over ${devices.length} real test device(s), chaos ${chaosOn ? "on" : "off"}.`, ``];
let failures = 0;
for (const d of devices) {
  const st = await d.engine!.status();
  const problems = await d.engine!.verifyAgainstServer();
  const close = await d.engine!.closeDay();
  const line = `Device ${d.deviceId}: unsent ${st.unsent}, accepted ${st.accepted}, red ${st.red}, gray ${st.gray}; calls ${d.chaos.counters.calls}, outages hit ${d.chaos.counters.blockedByOutage}, replies lost ${d.chaos.counters.repliesDropped}; check vs ZIMRA: ${problems.length ? problems.join("; ") : "match"}; close: ${close.ok ? `CLOSED after ${close.attempts} attempt(s)` : `FAILED ${close.reason} ${close.message}`}`;
  ev(line);
  summary.push(`- ${line}`);
  if (st.unsent || st.red || st.gray || problems.length || !close.ok) failures++;
  await d.engine!.shutdown();
}
const byStatus = new Map<string, number>();
for (const s of sales) byStatus.set(s.result?.status ?? "none", (byStatus.get(s.result?.status ?? "none") ?? 0) + 1);
summary.push(``, `Results given to the tills: ${[...byStatus].map(([k, v]) => `${k} ${v}`).join(", ")}`);
summary.push(``, failures ? `**${failures} device(s) did not finish clean.**` : `**Every device closed its day cleanly.**`);
for (const s of sales) if (s.result) writeFileSync(join(out, "receipts", `${s.req.invoiceNo}.json`), JSON.stringify({ request: s.req, result: s.result }, null, 2));
writeFileSync(join(out, "summary.md"), summary.join("\n"));
writeFileSync(join(out, "events.log"), events.join("\n"));
console.log(`\n${summary.join("\n")}\n\nOutput: ${out}`);
await client.db(db.databaseName).dropDatabase();
await client.close();
process.exit(failures ? 1 : 0);
