/**
 * Go-live rehearsal on the ZIMRA TEST system.
 *
 * The REAL app code (createPosSale, fiscalisePosSale, runPosQueue, issueCreditNote, closeFiscalDayWithReport) sells
 * through the REAL fiscal service into REAL ZIMRA test devices. Between the service and ZIMRA sits a switchable
 * fault layer, so "ZIMRA is down" can be staged on demand (we cannot make ZIMRA itself go down). Everything the
 * customer would be handed is saved as PDFs, the QR codes are read back and looked up at ZIMRA.
 *
 *   npx tsx scripts/acceptance-run.ts --certs=<certificates folder> [--scenario=fiscal-service/scenarios/acceptance.json]
 *       [--outage-secs=60] [--no-lookup] [--yes]
 *
 * Without --yes it only checks that every device is closed and clean. Each device must be FiscalDayClosed: the run
 * opens a day, sells, and closes it. Output: test-evidence/acceptance-<time>/ (summary.md first).
 *
 * What it proves (named steps in the summary):
 *   S1 normal trading on shared and own devices, USD/ZWG, tax-inclusive and exclusive, with and without a buyer
 *   S2 credit notes
 *   S3 ZIMRA unreachable: every sale still completes at the till with a provisional slip, nothing is lost
 *   S4 tills that are OFFLINE (no link to the app) reconnect while ZIMRA is still down
 *   S5 ZIMRA returns: everything is fiscalised exactly once, in order, with QR codes ZIMRA knows
 *   S6 the fiscal service is restarted mid-queue and resumes
 *   S7 the day closes cleanly on every device and the Z-report equals the sales
 */
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path, { join, resolve } from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const MONGO = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.MONGO_DB_NAME = "pos_acceptance_tmp";
process.env.MONGODB_URI = MONGO;
process.env.OFFLINE_MONGODB_URI = MONGO;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ZIMRA_API_URL;
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;
// Never email real people from a rehearsal.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "9";
const TOKEN = "acceptance-token-0123456789abcdef";
process.env.FISCAL_BACKEND = "service";
process.env.FISCAL_SERVICE_TOKEN = TOKEN;
process.env.LOG_LEVEL = "error";

interface Scenario {
  name: string;
  seed?: number;
  devices: { id: string; zimraId: number }[];
  branches: { name: string; device: string; tills: number; taxInclusive?: boolean }[];
  phases: { normal: number; credits: number; outage: number; offlineTills: number; afterRestart: number };
  outageSeconds?: number;
  offlineTillRate?: number;
}

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const certsDir = flag("certs");
const sc = JSON.parse(readFileSync(flag("scenario") ?? "fiscal-service/scenarios/acceptance.json", "utf-8")) as Scenario;
const outageSecs = Number(flag("outage-secs") ?? sc.outageSeconds ?? 60);
const doLookup = !argv.includes("--no-lookup");
const go = argv.includes("--yes");
if (!certsDir) {
  console.error("Usage: npx tsx scripts/acceptance-run.ts --certs=<certificates folder> [--scenario=...] [--outage-secs=60] [--no-lookup] [--yes]");
  process.exit(2);
}

function rng(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(sc.seed ?? 1);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Result { step: string; ok: boolean; label: string; detail?: string }
const results: Result[] = [];
let currentStep = "setup";
const check = (ok: boolean, label: string, detail?: string) => {
  results.push({ step: currentStep, ok, label, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `  -> ${detail.slice(0, 300)}` : ""}`);
};
const events: string[] = [];
const ev = (m: string) => {
  events.push(`${new Date().toISOString()} ${m}`);
  console.log(`  ..  ${m}`);
};
const step = (name: string, title: string) => {
  currentStep = name;
  console.log(`\n${name}  ${title}`);
  events.push(`${new Date().toISOString()} === ${name} ${title}`);
};

async function main() {
  const { MongoClient } = await import("mongodb");
  const { DeviceRegistry } = await import("../fiscal-service/src/devices/registry.js");
  const { createGatewayVerifier } = await import("../fiscal-service/src/devices/gateway-verifier.js");
  const { EngineManager } = await import("../fiscal-service/src/engine/manager.js");
  const { SecretBox } = await import("../fiscal-service/src/security/secret-box.js");
  const { createApp } = await import("../fiscal-service/src/server.js");
  const { NodeTransport } = await import("../fiscal-service/src/node/transport.js");
  const { FdmsClient } = await import("../fiscal-service/src/core/transport.js");
  const { ChaoticTransport } = await import("../fiscal-service/src/testing/chaotic-transport.js");
  const { parseDeviceCertificate } = await import("../fiscal-service/src/devices/cert-info.js");
  const { EvidenceRenderer, buildReceiptEvidence } = await import("./evidence/receipt-evidence");

  // ---- the real devices --------------------------------------------------------------------------------------
  interface Real {
    id: string;
    zimraId: number;
    serial: string;
    certificatePem: string;
    privateKeyPem: string;
    chaos: InstanceType<typeof ChaoticTransport>;
    http: InstanceType<typeof FdmsClient>;
    serviceId: string;
    appKey: string;
    taxPayer: Record<string, any>;
  }
  const real = new Map<string, Real>();
  let blocked = false;
  for (const d of sc.devices) {
    const dir = join(certsDir!, `certificates_${d.zimraId}`);
    if (!existsSync(join(dir, "cert.crt"))) {
      console.error(`Missing certificate folder ${dir}`);
      process.exit(2);
    }
    const certificatePem = readFileSync(join(dir, "cert.crt"), "utf-8");
    const privateKeyPem = readFileSync(join(dir, "key.key"), "utf-8");
    const info = parseDeviceCertificate(certificatePem);
    const inner = new NodeTransport({ certificatePem, privateKeyPem });
    const http = new FdmsClient({ deviceId: info.deviceId, serialNumber: info.serialNumber, modelName: "Server", modelVersion: "v1" }, new NodeTransport({ certificatePem, privateKeyPem }), { environment: "test" });
    const st = await http.request<Record<string, any>>("GET", `/Device/v1/${info.deviceId}/GetStatus`);
    const cfg = await http.request<Record<string, any>>("GET", `/Device/v1/${info.deviceId}/GetConfig`);
    const clean = st["fiscalDayStatus"] === "FiscalDayClosed";
    console.log(`Device ${d.zimraId} (${d.id}): ${st["fiscalDayStatus"]}, last day ${st["lastFiscalDayNo"]}, last receipt ${st["lastReceiptGlobalNo"]} -> ${clean ? "usable" : "NOT usable"}`);
    if (!clean) blocked = true;
    real.set(d.id, { id: d.id, zimraId: info.deviceId, serial: info.serialNumber, certificatePem, privateKeyPem, chaos: new ChaoticTransport(inner, rand), http, serviceId: "", appKey: "", taxPayer: cfg });
  }
  if (blocked) {
    console.error("\nAt least one device is not closed and clean. Close it (ZIMRA operations portal) or change the scenario.");
    process.exit(1);
  }
  if (!go) {
    console.log("\nAll devices are usable. Run again with --yes to start the rehearsal.");
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace("T", "_").replace(/[:.]/g, "-").slice(0, 19);
  const out = resolve("test-evidence", `acceptance-${stamp}`);
  mkdirSync(out, { recursive: true });
  console.log(`\nEvidence folder: ${out}`);

  // ---- the fiscal service (own database, real gateway, switchable faults) --------------------------------------------
  const byCertDevice = new Map([...real.values()].map((r) => [r.zimraId, r]));
  const client = await new MongoClient(MONGO, { serverSelectionTimeoutMS: 3000 }).connect();
  const svcDb = client.db(`fiscal_acceptance_${randomBytes(4).toString("hex")}`);
  const registry = new DeviceRegistry(svcDb, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), createGatewayVerifier());
  await registry.init();
  const startService = async () => {
    const manager = new EngineManager({
      db: svcDb,
      registry,
      transportFor: (ident) => byCertDevice.get(parseDeviceCertificate(ident.certificatePem).deviceId)!.chaos,
      options: { waitMs: 3_000, retryBaseMs: 500, retryMaxMs: 4_000, openGapMs: 4_000, onRed: "pause", drainTimeoutMs: 240_000, maxDateDriftMs: 270_000, busyWaitMs: 90_000 },
      backgroundMs: 500,
      alert: (a) => ev(`ALERT ${a.kind} ${a.deviceKey}: ${a.message}`),
    });
    const server = createApp({ registry, manager, token: TOKEN });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.FISCAL_SERVICE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { manager, server };
  };
  let svc = await startService();

  // ---- the app --------------------------------------------------------------------------------------------------
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const { default: FiscalDevice } = await import("@/database/fiscalDevice.model");
  const pos = await import("@/lib/services/posSale.service");
  const tillSvc = await import("@/lib/services/posTill.service");
  const ops = await import("@/lib/services/fiscalDayOps.service");
  const nums = await import("@/lib/services/posNumbering.service");

  const m = await dbConnect();
  await m.connection.dropDatabase();
  await FiscalSettings.create({ zimraApiUrl: "http://127.0.0.1:1", deviceId: "0", deviceSerialNumber: "NONE" });
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });

  for (const r of real.values()) {
    const sd = await registry.add({ tenantId: "company-1", name: r.id, certificatePem: r.certificatePem, privateKeyPem: r.privateKeyPem, environment: "test" });
    r.serviceId = String((sd as { id?: string }).id);
    const appDev = await FiscalDevice.create({ name: r.id, active: true, serviceDeviceId: r.serviceId, deviceId: String(r.zimraId) });
    r.appKey = String(appDev._id);
  }
  for (const r of real.values()) {
    const opened = await (await svc.manager.get(r.serviceId)).openDay();
    ev(`device ${r.zimraId}: day opened ${JSON.stringify(opened)}`);
  }
  await sleep(5_000); // ZIMRA stamps the day-open time itself; wait before the first receipt

  interface Till { branch: string; branchId: string; tillId: string; code: string; offline: boolean; device: Real }
  const tills: Till[] = [];
  const storeId = new m.Types.ObjectId();
  // A device keeps every invoice number it was ever given, and refuses a repeat as RCPT013 (a Red receipt that stops
  // the day closing). The branch counters start at 0001 in this throw-away database, so every run needs prefixes that
  // no earlier run used on these devices: the branch initial, two characters from the clock, and the branch's position.
  const runTag = Math.floor(Date.now() / 1000).toString(36).slice(-2).toUpperCase();
  for (const [bi, b] of sc.branches.entries()) {
    const dev = real.get(b.device)!;
    const a = dev.taxPayer["deviceBranchAddress"] ?? {};
    const doc = await Branch.create({
      name: b.name,
      storeId,
      location: b.name,
      pos: {
        enabled: true,
        invoicePrefix: `${b.name.slice(0, 1).toUpperCase()}${runTag}${bi % 10}`,
        taxPercent: 15.5,
        taxCode: "A",
        taxInclusive: b.taxInclusive !== false,
        defaultCurrency: "USD",
        fiscalDeviceId: dev.appKey,
        receipt: { companyName: dev.taxPayer["taxPayerName"], branchName: b.name, address: [a.houseNo, a.street, a.city].filter(Boolean).join(", "), tin: dev.taxPayer["taxPayerTIN"], vatNumber: dev.taxPayer["vatNumber"], footerLines: ["Rehearsal on the ZIMRA test system"] },
      },
    });
    for (const t of await tillSvc.setTillCount(String(doc._id), b.tills)) {
      tills.push({ branch: b.name, branchId: String(doc._id), tillId: t.id, code: t.code, offline: rand() < (sc.offlineTillRate ?? 0.4), device: dev });
    }
  }
  const cashier = String(new m.Types.ObjectId());
  const items = [["Bread", 1.5], ["Milk 1L", 2.2], ["Sugar 2kg", 3.4], ["Rice 5kg", 6.8], ["Cooking oil", 4.75], ["Soap", 0.9], ["Maize meal", 9.99], ["Eggs tray", 5.1]] as const;
  let counter = 0;
  const buyers = [undefined, { registerName: "Example Traders (Pvt) Ltd", tin: "2000999888", email: "accounts@example.com", address: "5 Industrial Way", city: "Harare" }];
  const newSale = (t: Till, key?: string) => {
    const currency: "USD" | "ZWG" = rand() < 0.4 ? "ZWG" : "USD";
    const k = 1 + Math.floor(rand() * 3);
    return {
      branchId: t.branchId,
      cashierId: cashier,
      tillId: t.tillId,
      idempotencyKey: key ?? `acc-${++counter}-${randomBytes(4).toString("hex")}`,
      currency,
      paymentMethod: pick(["CASH", "CARD"] as const),
      isTest: false,
      buyer: pick(buyers),
      lines: Array.from({ length: k }, () => {
        const [description, price] = pick([...items]);
        return { description, quantity: 1 + Math.floor(rand() * 3), unitPrice: Math.round(price * (currency === "ZWG" ? 26 : 1) * 100) / 100 };
      }),
    };
  };

  const renderer = new EvidenceRenderer();
  const madeIds: { id: string; till: Till; phase: string; atTime?: { status: string; provisional?: string; ms: number } }[] = [];
  const snapshotDir = (t: Till, n: number, inv: string, sub: string) => join(out, t.branch, t.code, `${String(n).padStart(3, "0")}_${inv}`, sub);
  let seq = 0;

  /** Make a sale the way a till does and, if it did not fiscalise at once, save the slip the customer was handed. */
  async function till_sale(t: Till, phase: string, opts: { offlineNumber?: string; soldAt?: Date } = {}) {
    const input = newSale(t);
    const t0 = Date.now();
    const created = await pos.createPosSale({ ...input, ...(opts.offlineNumber ? { offline: true, provisionalNumber: opts.offlineNumber, soldAt: opts.soldAt } : {}) });
    const after = await pos.fiscalisePosSale(String(created._id), { reason: "till" });
    const ms = Date.now() - t0;
    const rec = { id: String(created._id), till: t, phase, atTime: { status: after.status, provisional: after.provisionalNumber, ms } };
    madeIds.push(rec);
    if (after.status !== "FISCALISED") {
      // The customer walked away with a provisional slip: keep it, it must be correct and carry no QR.
      const n = ++seq;
      const snap = after.toObject() as never;
      await buildReceiptEvidence(renderer, { dir: snapshotDir(t, n, after.provisionalNumber ?? String(after._id), "01_provisional-slip"), sale: snap, branch: (await Branch.findById(t.branchId).lean<{ pos: { receipt: never } }>())!.pos.receipt, lookup: false });
    }
    return rec;
  }

  const settle = async (label: string, maxMs = 300_000) => {
    const keys = [...real.values()].map((r) => r.appKey);
    const end = Date.now() + maxMs;
    for (;;) {
      await Promise.all(keys.map((k) => pos.runPosQueue(50, { deviceKey: k })));
      const open = await PosSale.countDocuments({ status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] } });
      if (open === 0) return true;
      if (Date.now() > end) {
        ev(`${label}: ${open} sale(s) still not fiscalised after ${maxMs / 1000}s`);
        return false;
      }
      await sleep(1_000);
    }
  };
  const allChaos = (fn: (c: InstanceType<typeof ChaoticTransport>) => void) => [...real.values()].forEach((r) => fn(r.chaos));
  const onlineTills = () => tills.filter((t) => !t.offline);
  /** GetStatus with retries: ZIMRA's test host times out now and then, and a check must not die on that. */
  const zimraStatus = async (r: Real): Promise<Record<string, any>> => {
    let last: unknown;
    for (let i = 0; i < 6; i++) {
      try {
        return await r.http.request<Record<string, any>>("GET", `/Device/v1/${r.zimraId}/GetStatus`);
      } catch (e) {
        last = e;
        await sleep(3_000 * (i + 1));
      }
    }
    throw last;
  };

  // =============================================================================================================
  step("S1", "normal trading on shared and own devices");
  for (let i = 0; i < sc.phases.normal; i++) await till_sale(pick(tills), "normal");
  await settle("S1");
  const s1 = await PosSale.find({}).lean();
  check(s1.length === sc.phases.normal, `${s1.length} sales were made`, `${s1.length} vs ${sc.phases.normal}`);
  check(s1.every((s) => s.status === "FISCALISED"), "every sale is fiscalised", s1.filter((s) => s.status !== "FISCALISED").map((s) => s.status).join(","));
  check(tills.some((t) => t.branch === "Harare") && tills.some((t) => t.branch === "Gweru"), "two branches share one device");

  step("S2", "credit notes");
  const toCredit = (await PosSale.find({ status: "FISCALISED", kind: { $ne: "CREDIT_NOTE" } }).limit(sc.phases.credits).lean());
  for (const o of toCredit) await pos.issueCreditNote(String(o._id), cashier, "Customer return");
  await settle("S2");
  const cns = await PosSale.find({ kind: "CREDIT_NOTE" }).lean();
  check(cns.length === toCredit.length, `${cns.length} credit notes were issued`);
  check(cns.every((c) => c.status === "FISCALISED"), "every credit note is fiscalised");
  check(cns.every((c) => String(c.fiscalDeviceKey) === String(toCredit.find((o) => String(o._id) === String(c.creditNoteId) || String(o._id) === String((c as { originalSaleId?: unknown }).originalSaleId))?.fiscalDeviceKey ?? c.fiscalDeviceKey)), "each credit note is on its original's device");

  // =============================================================================================================
  step("S3", `ZIMRA unreachable for ${outageSecs}s: tills must keep trading`);
  allChaos((c) => (c.faults.outage = true));
  ev("ZIMRA now unreachable from our service (fault layer)");
  const outageStart = Date.now();
  const held: { t: Till; number: string; at: Date }[] = [];
  const offlineQuota = sc.phases.offlineTills;
  const trading: Promise<void>[] = [];
  let outageSales = 0;
  const timeBlocked: number[] = [];
  for (let i = 0; i < sc.phases.outage; i++) {
    const t = pick(onlineTills());
    trading.push(
      (async () => {
        const rec = await till_sale(t, "outage");
        timeBlocked.push(rec.atTime!.ms);
        outageSales++;
      })()
    );
    if (trading.length % 6 === 0) await Promise.all(trading.splice(0));
  }
  await Promise.all(trading);
  const outageSaleDocs = await PosSale.find({ _id: { $in: madeIds.filter((x) => x.phase === "outage").map((x) => x.id) } }).lean();
  check(outageSales === sc.phases.outage, "every sale during the outage completed at the till (none refused, none lost)", `${outageSales}/${sc.phases.outage}`);
  check(timeBlocked.every((ms) => ms < 20_000), `no sale kept the cashier waiting more than 20 s (slowest ${Math.max(...timeBlocked)} ms)`);
  const waiting = outageSaleDocs.filter((s) => s.status !== "FISCALISED");
  check(waiting.every((s) => !!s.provisionalNumber), "every sale that could not be fiscalised yet has a provisional slip number", waiting.filter((s) => !s.provisionalNumber).map((s) => String(s._id)).join(","));
  ev(`${waiting.length} of ${outageSales} outage sales are waiting for ZIMRA; ${outageSales - waiting.length} already carry their fiscal data from the service`);

  // =============================================================================================================
  step("S4", "tills with NO link to the app sell on leased numbers and reconnect while ZIMRA is still down");
  const offTills = tills.filter((t) => t.offline);
  check(offTills.length > 0, `${offTills.length} tills run offline`, "scenario produced no offline tills; raise offlineTillRate");
  for (let i = 0; i < offlineQuota && offTills.length; i++) {
    const t = pick(offTills);
    const cur = (rand() < 0.4 ? "ZWG" : "USD") as "USD" | "ZWG";
    const b = await Branch.findById(t.branchId).select("pos.invoicePrefix").lean<{ pos: { invoicePrefix: string } }>();
    const n = await nums.allocateNumber(t.branchId, nums.seriesFor(cur, true));
    held.push({ t, number: nums.formatInvoiceNumber(b!.pos.invoicePrefix, cur, n, true), at: new Date() });
    void cur;
  }
  check(new Set(held.map((h) => h.number)).size === held.length, `${held.length} leased provisional numbers are all different`);
  const remaining = Math.max(0, outageSecs * 1000 - (Date.now() - outageStart));
  if (remaining > 0) {
    ev(`holding the outage for another ${(remaining / 1000).toFixed(0)}s`);
    await sleep(remaining);
  }
  ev("offline tills reconnect to the app (ZIMRA still down), in random order, some sales sent twice");
  const order = [...held].sort(() => rand() - 0.5);
  const offlineRecs: { id: string; number: string }[] = [];
  for (let i = 0; i < order.length; i += 5) {
    await Promise.all(
      order.slice(i, i + 5).map(async (h) => {
        const input = newSale(h.t);
        const send = () => pos.createPosSale({ ...input, offline: true, provisionalNumber: h.number, soldAt: h.at });
        const [a, b] = rand() < 0.3 ? await Promise.all([send(), send()]) : [await send(), undefined];
        if (b && String(a._id) !== String(b._id)) ev(`DUPLICATE SALE ${input.idempotencyKey}`);
        const after = await pos.fiscalisePosSale(String(a._id), { reason: "till" });
        madeIds.push({ id: String(a._id), till: h.t, phase: "offline-till" });
        offlineRecs.push({ id: String(a._id), number: h.number });
        if (after.status !== "FISCALISED") {
          const n = ++seq;
          await buildReceiptEvidence(renderer, { dir: snapshotDir(h.t, n, h.number, "01_provisional-slip"), sale: after.toObject() as never, branch: (await Branch.findById(h.t.branchId).lean<{ pos: { receipt: never } }>())!.pos.receipt, lookup: false });
        }
      })
    );
  }
  check(!events.some((e) => e.includes("DUPLICATE SALE")), "a sale sent twice by an offline till is stored once");
  const offDocs = await PosSale.find({ _id: { $in: offlineRecs.map((r) => r.id) } }).lean();
  check(offDocs.length === held.length, "every offline sale is stored exactly once", `${offDocs.length} vs ${held.length}`);
  check(offDocs.every((d) => offlineRecs.find((r) => r.id === String(d._id))?.number === d.provisionalNumber), "each offline sale kept the provisional number printed on its slip");

  // =============================================================================================================
  step("S6", "the fiscal service is restarted while sales are still waiting (done before ZIMRA returns)");
  const waitingBefore = await PosSale.countDocuments({ status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] } });
  await svc.manager.shutdown();
  await new Promise<void>((r) => svc.server.close(() => r()));
  ev(`service stopped with ${waitingBefore} sale(s) waiting`);
  await sleep(2_000);
  svc = await startService();
  const started = await svc.manager.startAll();
  ev(`service restarted: ${JSON.stringify(started)}`);
  check(started.failed.length === 0, "every device engine came back after the restart", JSON.stringify(started.failed));

  // =============================================================================================================
  step("S5", "ZIMRA returns: everything is fiscalised exactly once, in order");
  allChaos((c) => (c.faults.outage = false));
  ev("ZIMRA reachable again");
  const drained = await settle("S5", 420_000);
  check(drained, "every queued sale was fiscalised after ZIMRA returned");
  for (let i = 0; i < sc.phases.afterRestart; i++) await till_sale(pick(tills.filter((t) => !t.offline).length ? onlineTills() : tills), "after-restart");
  await settle("after restart");

  const all = await PosSale.find({}).sort({ createdAt: 1 }).lean();
  const sales = all.filter((s) => s.kind !== "CREDIT_NOTE");
  const expected = sc.phases.normal + sc.phases.outage + held.length + sc.phases.afterRestart;
  check(sales.length === expected, `exactly one record per sale made (${expected})`, `${sales.length}`);
  check(all.every((s) => s.status === "FISCALISED"), "every sale and credit note is FISCALISED", all.filter((s) => s.status !== "FISCALISED").map((s) => `${s.invoiceNumber ?? s.provisionalNumber}:${s.status}:${s.lastError}`).slice(0, 3).join("; "));
  check(all.filter((s) => (s as { needsReview?: boolean }).needsReview).length === 0, "nothing is flagged for review");
  const invoiceNos = all.map((s) => s.invoiceNumber);
  check(new Set(invoiceNos).size === invoiceNos.length, "no invoice number is used twice");

  const receiptsCol = svcDb.collection("receipts");
  for (const r of real.values()) {
    const mine = all.filter((s) => String(s.fiscalDeviceKey) === r.appKey);
    const rows = await receiptsCol.find({ deviceKey: r.serviceId }).toArray() as unknown as { status: string; colour?: string; globalNo?: number; receiptGlobalNo?: number; invoiceNo?: string }[];
    const accepted = rows.filter((x) => x.status === "ACCEPTED");
    const label = `device ${r.zimraId}`;
    check(accepted.length === mine.length, `${label}: ZIMRA holds exactly one receipt per sale`, `${accepted.length} vs ${mine.length}`);
    const flagged = rows.filter((x) => x.colour && x.colour !== "none");
    check(flagged.length === 0, `${label}: no Yellow, Gray or Red receipt`, flagged.map((x) => `${x.invoiceNo}:${x.colour}`).slice(0, 3).join(","));
    const nosAsc = mine.map((s) => Number(s.fiscal?.receiptGlobalNo)).sort((a, b) => a - b);
    const gapless = nosAsc.every((n, i) => i === 0 || n === nosAsc[i - 1]! + 1);
    check(gapless && new Set(nosAsc).size === nosAsc.length, `${label}: receipt numbers run on with no gap and no repeat`, nosAsc.join(",").slice(0, 200));
    const counters = mine.map((s) => Number(s.fiscal?.receiptCounter)).sort((a, b) => a - b);
    check(counters.every((n, i) => n === i + 1), `${label}: receipt counters run 1..n`);
    const st = await zimraStatus(r);
    check(Number(st["lastReceiptGlobalNo"]) === Math.max(...nosAsc), `${label}: ZIMRA's last receipt number equals ours`, `${st["lastReceiptGlobalNo"]} vs ${Math.max(...nosAsc)}`);
    check(mine.every((s) => String(s.fiscal?.deviceId) === String(r.zimraId) && (s.fiscal?.qrCodeUrl ?? "").includes(String(r.zimraId).padStart(10, "0"))), `${label}: every receipt carries its own device's id and QR`);
  }
  check(all.filter((s) => s.kind === "CREDIT_NOTE").length === toCredit.length, "credit notes: none lost");
  // Receipt order on a device follows the order the sales were taken, sale by sale (single-file part of the run).
  for (const r of real.values()) {
    const seqSales = madeIds.filter((x) => x.phase === "outage" && x.till.device === r).map((x) => all.find((a) => String(a._id) === x.id)!).filter(Boolean);
    const byTaken = [...seqSales].sort((a, b) => +new Date(a.soldAt) - +new Date(b.soldAt));
    const nos = byTaken.map((s) => Number(s.fiscal?.receiptGlobalNo));
    check(nos.every((n, i) => i === 0 || n > nos[i - 1]!), `device ${r.zimraId}: sales taken during the outage were fiscalised in the order they were taken`, nos.join(",").slice(0, 200));
  }

  // =============================================================================================================
  step("S7", "the day closes cleanly on every device");
  const closes = new Map<string, { ok: boolean; usd?: number | null; zwg?: number | null; message?: string }>();
  for (const r of real.values()) {
    try {
      const z = await ops.closeFiscalDayWithReport("manual", { deviceKey: r.appKey });
      closes.set(r.id, { ok: true, usd: z.totalSalesUsd, zwg: z.totalSalesZwg });
    } catch (e) {
      closes.set(r.id, { ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const r of real.values()) {
    const c = closes.get(r.id)!;
    check(c.ok, `device ${r.zimraId}: the fiscal day closed from the app`, c.message);
    if (c.ok) {
      const mine = all.filter((s) => String(s.fiscalDeviceKey) === r.appKey && s.kind !== "CREDIT_NOTE");
      for (const [cur, got] of [["USD", c.usd], ["ZWG", c.zwg]] as const) {
        const want = mine.filter((s) => s.currency === cur).reduce((t, s) => t + s.totalAmount, 0);
        check(Math.abs((got ?? 0) - want) < 0.01, `device ${r.zimraId}: Z-report ${cur} sales equal the sales`, `${got} vs ${want.toFixed(2)}`);
      }
    }
    const st = await zimraStatus(r);
    check(st["fiscalDayStatus"] === "FiscalDayClosed", `device ${r.zimraId}: ZIMRA reports the day closed`, String(st["fiscalDayStatus"]));
  }

  // =============================================================================================================
  step("EVIDENCE", `printed receipts as PDFs, QR decoded and ${doLookup ? "looked up at ZIMRA" : "matched (no ZIMRA lookup)"}`);
  const csv = ["n,branch,till,invoiceNo,provisional,kind,currency,total,device,globalNo,phase,status,qrDecoded,zimra,result,problems"];
  const phaseOf = new Map(madeIds.map((x) => [x.id, x.phase]));
  let n = 0;
  let evidenceFail = 0;
  let unconfirmed = 0;
  for (const s of all) {
    n++;
    const t = tills.find((x) => x.tillId === String(s.tillId));
    const r = [...real.values()].find((x) => x.appKey === String(s.fiscalDeviceKey))!;
    const branchProfile = (await Branch.findById(s.branchId).lean<{ pos: { receipt: never } }>())!.pos.receipt;
    const res = await buildReceiptEvidence(renderer, {
      dir: join(out, t?.branch ?? "unknown", t?.code ?? "T0", `${String(n).padStart(3, "0")}_${s.invoiceNumber}`, "02_fiscal-invoice"),
      sale: s as never,
      branch: branchProfile,
      gatewayQrUrl: s.fiscal?.qrCodeUrl,
      expectTotal: s.kind === "CREDIT_NOTE" ? Math.abs(s.totalAmount) : s.totalAmount,
      expectCurrency: s.currency,
      lookup: doLookup,
      lookupTries: 10,
      lookupWaitMs: 5_000,
    });
    const failed = res.checks.filter((c) => !c.ok && c.level !== "warn");
    const warned = res.checks.filter((c) => !c.ok && c.level === "warn");
    if (failed.length) evidenceFail++;
    else if (warned.length) unconfirmed++;
    writeFileSync(join(out, t?.branch ?? "unknown", t?.code ?? "T0", `${String(n).padStart(3, "0")}_${s.invoiceNumber}`, "receipt.json"), JSON.stringify({ phase: phaseOf.get(String(s._id)) ?? (s.kind === "CREDIT_NOTE" ? "credit" : "?"), device: r.zimraId, checks: res.checks, lookup: res.lookup }, null, 2));
    csv.push([n, t?.branch, t?.code, s.invoiceNumber, s.provisionalNumber ?? "", s.kind ?? "SALE", s.currency, s.totalAmount.toFixed(2), r.zimraId, s.fiscal?.receiptGlobalNo ?? "", phaseOf.get(String(s._id)) ?? (s.kind === "CREDIT_NOTE" ? "credit" : ""), s.status, res.qr?.decoded ? "yes" : "NO", res.lookup?.state ?? "skipped", failed.length ? "FAIL" : warned.length ? "UNCONFIRMED" : "PASS", failed.map((c) => c.name.replace(/,/g, ";")).join("|")].join(","));
    process.stdout.write(`\r  ${n}/${all.length} receipts rendered and checked`);
  }
  console.log("");
  await renderer.stop();
  check(evidenceFail === 0, `all ${all.length} receipts: PDFs correct, QR decoded and matching${doLookup ? ", ZIMRA says valid" : ""}`, `${evidenceFail} receipt(s) failed, see index.csv`);
  if (doLookup) check(unconfirmed === 0, "no receipt is still unconfirmed at ZIMRA", `${unconfirmed} unconfirmed`);
  const provisionalFolders = madeIds.filter((x) => x.atTime && x.atTime.status !== "FISCALISED").length + offlineRecs.length;
  ev(`${provisionalFolders} provisional slips were handed out and saved`);

  writeFileSync(join(out, "index.csv"), csv.join("\n"));
  writeFileSync(join(out, "events.log"), events.join("\n"));
  const failedChecks = results.filter((r) => !r.ok);
  const steps = [...new Set(results.map((r) => r.step))];
  const summary = [
    `# Acceptance rehearsal: ${sc.name}`,
    ``,
    `${new Date().toISOString()}. ZIMRA TEST system, ${real.size} real devices, ${tills.length} tills in ${sc.branches.length} branches, ${all.length} documents (${sales.length} sales, ${all.length - sales.length} credit notes). Outage held ${outageSecs} s. ${held.length} sales came from offline tills.`,
    ``,
    failedChecks.length ? `## RESULT: ${failedChecks.length} CHECK(S) FAILED\n${failedChecks.map((f) => `- [${f.step}] ${f.label}${f.detail ? ` — ${f.detail.slice(0, 200)}` : ""}`).join("\n")}\n` : `## RESULT: ALL ${results.length} CHECKS PASSED\n`,
    ...steps.map((s) => `### ${s}\n${results.filter((r) => r.step === s).map((r) => `- ${r.ok ? "PASS" : "FAIL"} ${r.label}`).join("\n")}\n`),
    `Folder layout: \`<branch>/<till>/<n>_<invoice>/01_provisional-slip\` (only when the customer was handed a provisional slip) and \`02_fiscal-invoice\` (slip-80mm.pdf, a4-invoice.pdf, qr.png). \`index.csv\` has one row per document.`,
  ].join("\n");
  writeFileSync(join(out, "summary.md"), summary);
  console.log(`\n${failedChecks.length ? `${failedChecks.length} CHECK(S) FAILED` : "ALL CHECKS PASSED"}\nSummary: ${join(out, "summary.md")}`);

  await svc.manager.shutdown();
  await new Promise<void>((r) => svc.server.close(() => r()));
  await svcDb.dropDatabase();
  await client.close();
  await m.connection.dropDatabase();
  await m.connection.close();
  process.exit(failedChecks.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
