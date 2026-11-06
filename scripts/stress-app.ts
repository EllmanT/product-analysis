/**
 * Phase 6: the whole chain under load. Many tills in many branches sell through the REAL app code
 * (createPosSale, fiscalisePosSale, runPosQueue, issueCreditNote, closeFiscalDayWithReport) into the REAL
 * fiscal-service (engine, registry, HTTP API), which talks to the fake ZIMRA gateway. Topology and chaos come from a
 * scenario file, so "all branches on one device", "one device per branch" and mixes are settings, not code.
 *
 *   npm run stress:app -- fiscal-service/scenarios/mixed.json [--sales=120] [--concurrency=30] [--seed=5]
 *
 * Scenario (same files as the service's own stress run), plus optional:
 *   branches[].taxInclusive      false for a branch that prices without tax
 *   chaos.serviceOutage          { fromPct, toPct }: the app cannot reach the fiscal service at all
 *   flip                         { branch, toDevice, atPct }: re-assign a branch's device mid-run
 * Needs MongoDB. Output: test-output/app-stress-<name>-<time>/ with one receipt file per sale (by branch and till),
 * index.csv, summary.md and events.log. Throw-away databases only; no real device is touched.
 */
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path, { join, resolve } from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const MONGO = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.MONGO_DB_NAME = "pos_app_stress_tmp";
process.env.MONGODB_URI = MONGO;
process.env.OFFLINE_MONGODB_URI = MONGO;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ZIMRA_API_URL;
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;
const TOKEN = "app-stress-token-0123456789abcdef";
process.env.FISCAL_BACKEND = "service";
process.env.FISCAL_SERVICE_TOKEN = TOKEN;
process.env.LOG_LEVEL = "error";

interface Scenario {
  name: string;
  description?: string;
  seed?: number;
  devices: { id: string; vatPayer?: boolean }[];
  branches: { name: string; device: string; tills: number; taxInclusive?: boolean }[];
  sales: number;
  concurrency: number;
  currencies?: Record<string, number>;
  creditNoteRate?: number;
  flakyTillRate?: number;
  /** Share of tills that sell offline (leased provisional numbers) and reconnect together at `offlineSyncAtPct`. */
  offlineTillRate?: number;
  offlineSyncAtPct?: number;
  chaos?: {
    globalOutage?: { fromPct: number; toPct: number };
    outages?: { device: string; fromPct: number; toPct: number }[];
    serviceOutage?: { fromPct: number; toPct: number };
    dropReplyRate?: number;
    dropRequestRate?: number;
    serverErrors?: number;
    latencyMs?: number;
    jitterMs?: number;
  };
  flip?: { branch: string; toDevice: string; atPct: number };
}

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run stress:app -- <scenario.json> [--sales=N] [--concurrency=N] [--seed=N]");
  process.exit(2);
}
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const sc = JSON.parse(readFileSync(file, "utf-8")) as Scenario;
if (flag("sales")) sc.sales = Number(flag("sales"));
if (flag("concurrency")) sc.concurrency = Number(flag("concurrency"));
const seed = Number(flag("seed") ?? sc.seed ?? 1);

function rng(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const results: { ok: boolean; label: string; detail?: string }[] = [];
const check = (ok: boolean, label: string, detail?: string) => results.push({ ok, label, detail });
const events: string[] = [];
const ev = (m: string) => {
  events.push(`${new Date().toISOString()} ${m}`);
  if (process.env.STRESS_VERBOSE) console.log(m);
};

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve("test-output", `app-stress-${sc.name}-${stamp}`);
  mkdirSync(join(out, "receipts"), { recursive: true });
  console.log(`Scenario "${sc.name}": ${sc.sales} sales, ${sc.concurrency} concurrent, seed ${seed}. Output: ${out}`);

  const { MongoClient } = await import("mongodb");
  const { FetchTransport } = await import("../fiscal-service/src/core/fetch-transport.js");
  const { DeviceRegistry } = await import("../fiscal-service/src/devices/registry.js");
  const { EngineManager } = await import("../fiscal-service/src/engine/manager.js");
  const { SecretBox } = await import("../fiscal-service/src/security/secret-box.js");
  const { createApp } = await import("../fiscal-service/src/server.js");
  const { FakeGateway } = await import("../fiscal-service/src/testing/fake-gateway.js");
  const { makeDeviceBundle } = await import("../fiscal-service/src/testing/make-cert.js");

  // ---- the service ----------------------------------------------------------------------------------------------
  const gw = new FakeGateway({ random: rand });
  await gw.start();
  gw.faults.closeDelayMs = 30;
  const client = await new MongoClient(MONGO, { serverSelectionTimeoutMS: 3000 }).connect();
  const svcDb = client.db(`fiscal_app_stress_${randomBytes(4).toString("hex")}`);
  const registry = new DeviceRegistry(svcDb, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), async () => ({ taxPayerName: "FAKE", fetchedAt: new Date() }));
  await registry.init();
  const manager = new EngineManager({
    db: svcDb, registry, baseUrl: gw.url, transportFor: () => new FetchTransport(),
    options: { waitMs: 4_000, retryBaseMs: 40, retryMaxMs: 400, openGapMs: 1_100, onRed: "continue", drainTimeoutMs: 120_000, closePollMs: 20, closePollTimeoutMs: 5_000, maxDateDriftMs: 270_000, busyWaitMs: 60_000 },
    backgroundMs: 100,
    alert: (a) => ev(`ALERT ${a.kind} ${a.deviceKey}: ${a.message}`),
  });
  const server = createApp({ registry, manager, token: TOKEN });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const goodUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.FISCAL_SERVICE_URL = goodUrl;

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

  const m = await dbConnect();
  await m.connection.dropDatabase();
  await FiscalSettings.create({ zimraApiUrl: "http://127.0.0.1:1", deviceId: "0", deviceSerialNumber: "NONE" });
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });

  interface Dev { id: string; zimraId: number; serviceId: string; appKey: string }
  const devs = new Map<string, Dev>();
  let nextId = 9300;
  for (const d of sc.devices) {
    const zimraId = ++nextId;
    const b = makeDeviceBundle(zimraId);
    gw.addDevice(zimraId, b.serialNumber, b.certificatePem, { vatPayer: d.vatPayer ?? true });
    const sd = await registry.add({ tenantId: "company-1", name: d.id, certificatePem: b.certificatePem, privateKeyPem: b.privateKeyPem, environment: "test" });
    const serviceId = String((sd as { id?: string }).id);
    const eng = await manager.get(serviceId);
    await eng.openDay();
    const appDev = await FiscalDevice.create({ name: d.id, active: true, serviceDeviceId: serviceId, deviceId: String(zimraId) });
    devs.set(d.id, { id: d.id, zimraId, serviceId, appKey: String(appDev._id) });
  }
  await sleep(1_300);

  const storeId = new m.Types.ObjectId();
  interface Till { branch: string; branchId: string; tillId: string; code: string; flaky: boolean; offline: boolean }
  const tills: Till[] = [];
  const branchIds = new Map<string, string>();
  for (const b of sc.branches) {
    const dev = devs.get(b.device);
    if (!dev) throw new Error(`Branch ${b.name} uses unknown device ${b.device}`);
    const doc = await Branch.create({
      name: b.name, storeId, location: b.name,
      pos: { enabled: true, invoicePrefix: b.name.slice(0, 2).toUpperCase(), taxPercent: 15.5, taxCode: "A", taxInclusive: b.taxInclusive !== false, defaultCurrency: "USD", fiscalDeviceId: dev.appKey },
    });
    branchIds.set(b.name, String(doc._id));
    const list = await tillSvc.setTillCount(String(doc._id), b.tills);
    for (const t of list) tills.push({ branch: b.name, branchId: String(doc._id), tillId: t.id, code: t.code, flaky: rand() < (sc.flakyTillRate ?? 0), offline: rand() < (sc.offlineTillRate ?? 0) });
  }
  const cashier = String(new m.Types.ObjectId());

  // ---- sales ----------------------------------------------------------------------------------------------------
  const items = [["Bread", 1.5], ["Milk 1L", 2.2], ["Sugar 2kg", 3.4], ["Rice 5kg", 6.8], ["Cooking oil", 4.75], ["Soap", 0.9], ["Maize meal", 9.99], ["Eggs tray", 5.1]] as const;
  const currencies = Object.entries(sc.currencies ?? { USD: 1 });
  const pickCurrency = (): "USD" | "ZWG" => {
    let r = rand() * currencies.reduce((s, [, w]) => s + w, 0);
    for (const [c, w] of currencies) if ((r -= w) <= 0) return c as "USD" | "ZWG";
    return currencies[0]![0] as "USD" | "ZWG";
  };
  interface Sale { n: number; till: Till; key: string; currency: "USD" | "ZWG"; lines: { description: string; quantity: number; unitPrice: number }[]; id?: string; deviceAtSale?: string }
  const sales: Sale[] = Array.from({ length: sc.sales }, (_, n) => {
    const currency = pickCurrency();
    const k = 1 + Math.floor(rand() * 4);
    return {
      n, till: pick(tills), key: `st-${seed}-${n}-${randomBytes(4).toString("hex")}`, currency,
      lines: Array.from({ length: k }, () => {
        const [description, price] = pick([...items]);
        return { description, quantity: 1 + Math.floor(rand() * 3), unitPrice: Math.round(price * (currency === "ZWG" ? 26 : 1) * 100) / 100 };
      }),
    };
  });

  // ---- chaos timeline -------------------------------------------------------------------------------------------
  const c = sc.chaos ?? {};
  gw.faults.dropReplyRate = c.dropReplyRate ?? 0;
  gw.faults.dropRequestRate = c.dropRequestRate ?? 0;
  gw.faults.delayMs = c.latencyMs ?? 0;
  gw.faults.jitterMs = c.jitterMs ?? 0;
  const outageOn = new Set<string>();
  let serviceDown = false;
  let errorBursts: ReturnType<typeof setInterval> | undefined;
  let flipped = false;
  let progress = 0;
  async function applyChaos() {
    const pct = (progress / sc.sales) * 100;
    for (const o of c.outages ?? []) {
      const on = pct >= o.fromPct && pct < o.toPct;
      const d = devs.get(o.device)!;
      if (on && !outageOn.has(o.device)) { gw.faults.downDevices.add(d.zimraId); outageOn.add(o.device); ev(`CHAOS device ${o.device} down at ${pct.toFixed(0)}%`); }
      else if (!on && outageOn.has(o.device)) { gw.faults.downDevices.delete(d.zimraId); outageOn.delete(o.device); ev(`CHAOS device ${o.device} up at ${pct.toFixed(0)}%`); }
    }
    const g = c.globalOutage;
    if (g) {
      const on = pct >= g.fromPct && pct < g.toPct;
      if (on !== gw.faults.down) { gw.faults.down = on; ev(`CHAOS ZIMRA ${on ? "unreachable" : "reachable"} at ${pct.toFixed(0)}%`); }
    }
    const so = c.serviceOutage;
    if (so) {
      const on = pct >= so.fromPct && pct < so.toPct;
      if (on !== serviceDown) { serviceDown = on; process.env.FISCAL_SERVICE_URL = on ? "http://127.0.0.1:1" : goodUrl; ev(`CHAOS fiscal service ${on ? "unreachable" : "reachable"} at ${pct.toFixed(0)}%`); }
    }
    if (sc.flip && !flipped && pct >= sc.flip.atPct) {
      flipped = true;
      await Branch.updateOne({ _id: branchIds.get(sc.flip.branch) }, { $set: { "pos.fiscalDeviceId": devs.get(sc.flip.toDevice)!.appKey } });
      ev(`FLIP ${sc.flip.branch} now uses device ${sc.flip.toDevice} at ${pct.toFixed(0)}%`);
    }
  }
  if (c.serverErrors) {
    errorBursts = setInterval(() => { gw.faults.serverErrors = c.serverErrors!; }, 900);
    errorBursts.unref();
  }

  // ---- load -----------------------------------------------------------------------------------------------------
  let next = 0;
  const t0 = Date.now();
  const firstStatus = new Map<string, string>();
  // Offline tills: the sale is made without reaching the app, with a leased provisional number already printed.
  const held: { s: Sale; input: Parameters<typeof pos.createPosSale>[0]; provisional: string; soldAt: Date }[] = [];
  let reconnecting: Promise<void> | null = null;
  async function reconnect() {
    ev(`OFFLINE tills reconnect with ${held.length} held sales`);
    const batch = held.splice(0, held.length);
    for (let i = batch.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [batch[i], batch[j]] = [batch[j]!, batch[i]!]; } // random order across tills
    for (let i = 0; i < batch.length; i += 10) {
      await Promise.all(batch.slice(i, i + 10).map(async (h) => {
        const send = () => pos.createPosSale({ ...h.input, offline: true, provisionalNumber: h.provisional, soldAt: h.soldAt });
        const twice = rand() < 0.25; // the reply was lost, so the till sends it again
        const [a, b] = twice ? await Promise.all([send(), send()]) : [await send(), undefined];
        if (b && String(a._id) !== String(b._id)) ev(`DUPLICATE SALE ${h.s.key}`);
        await pos.fiscalisePosSale(String(a._id), { reason: "till" });
        h.s.id = String(a._id);
        h.s.deviceAtSale = a.fiscalDeviceKey;
      }));
    }
  }
  const offlineProvisional = new Map<string, string>();
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= sales.length) return;
      const s = sales[i]!;
      progress = i;
      await applyChaos();
      const input = { branchId: s.till.branchId, cashierId: cashier, tillId: s.till.tillId, idempotencyKey: s.key, currency: s.currency, paymentMethod: pick(["CASH", "CARD"] as const), isTest: false, lines: s.lines };
      if (s.till.offline) {
        const nums = await import("@/lib/services/posNumbering.service");
        const br = await Branch.findById(s.till.branchId).select("pos.invoicePrefix").lean<{ pos?: { invoicePrefix?: string } }>();
        const n = await nums.allocateNumber(s.till.branchId, nums.seriesFor(s.currency, true));
        const provisional = nums.formatInvoiceNumber(br!.pos!.invoicePrefix!, s.currency, n, true);
        offlineProvisional.set(s.key, provisional);
        held.push({ s, input, provisional, soldAt: new Date() });
        if (progress >= (sc.sales * (sc.offlineSyncAtPct ?? 70)) / 100 && !reconnecting) reconnecting = reconnect();
        continue;
      }
      const create = () => pos.createPosSale(input);
      let created: Awaited<ReturnType<typeof create>>;
      if (s.till.flaky) {
        // A till with a bad connection sends the same sale twice at once.
        const [a, b] = await Promise.all([create(), create()]);
        created = a;
        if (String(a._id) !== String(b._id)) ev(`DUPLICATE SALE ${s.key}`);
        await Promise.all([pos.fiscalisePosSale(String(a._id), { reason: "till" }), pos.fiscalisePosSale(String(b._id), { reason: "till" })]);
      } else {
        created = await create();
        const after = await pos.fiscalisePosSale(String(created._id), { reason: "till" });
        firstStatus.set(s.key, after.status);
      }
      s.id = String(created._id);
      s.deviceAtSale = created.fiscalDeviceKey;
    }
  }
  await Promise.all(Array.from({ length: sc.concurrency }, worker));
  if (reconnecting) await reconnecting;
  if (held.length) await reconnect(); // anything still held reconnects at the end
  progress = sc.sales;
  ev(`LOAD finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ---- heal and drain ---------------------------------------------------------------------------------------------
  async function heal() {
    if (errorBursts) clearInterval(errorBursts);
    gw.faults.down = false;
    gw.faults.downDevices.clear();
    gw.faults.dropReplyRate = 0;
    gw.faults.dropRequestRate = 0;
    gw.faults.delayMs = 0;
    gw.faults.jitterMs = 0;
    gw.faults.serverErrors = 0;
    process.env.FISCAL_SERVICE_URL = goodUrl;
    const keys = [...devs.values()].map((d) => d.appKey);
    const end = Date.now() + 240_000;
    for (;;) {
      await Promise.all(keys.map((k) => pos.runPosQueue(50, { deviceKey: k })));
      const open = await PosSale.countDocuments({ status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] } });
      if (open === 0) return true;
      if (Date.now() > end) return false;
      await sleep(300);
    }
  }
  ev("HEAL all faults cleared");
  const drained1 = await heal();

  // ---- credit notes -----------------------------------------------------------------------------------------------
  const fiscalised = await PosSale.find({ status: "FISCALISED", kind: { $ne: "CREDIT_NOTE" } });
  const toCredit = fiscalised.filter(() => rand() < (sc.creditNoteRate ?? 0));
  const creditIds: string[] = [];
  for (let i = 0; i < toCredit.length; i += 12) {
    await Promise.all(
      toCredit.slice(i, i + 12).map(async (o) => {
        const cn = await pos.issueCreditNote(String(o._id), cashier, "Customer return");
        creditIds.push(String(cn._id));
      })
    );
  }
  ev(`CREDIT ${creditIds.length} credit notes issued`);
  const drained2 = await heal();

  // ---- close every day through the app ---------------------------------------------------------------------------------
  const closes = new Map<string, { ok: boolean; message?: string; usd?: number | null; zwg?: number | null }>();
  for (const d of devs.values()) {
    try {
      const z = await ops.closeFiscalDayWithReport("manual", { deviceKey: d.appKey });
      closes.set(d.id, { ok: true, usd: z.totalSalesUsd, zwg: z.totalSalesZwg });
    } catch (e) {
      closes.set(d.id, { ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---- receipt files --------------------------------------------------------------------------------------------------
  const all = await PosSale.find({}).sort({ soldAt: 1 }).lean();
  const tillById = new Map(tills.map((t) => [t.tillId, t]));
  const csv = ["invoiceNo,branch,till,device,kind,currency,total,status,globalNo,counter,qr"];
  const appKeyToDev = new Map([...devs.values()].map((d) => [d.appKey, d]));
  for (const s of all) {
    const till = tillById.get(String(s.tillId));
    const dev = appKeyToDev.get(String(s.fiscalDeviceKey));
    const dir = join(out, "receipts", till?.branch ?? "unknown", till?.code ?? "T0");
    mkdirSync(dir, { recursive: true });
    const f = s.fiscal;
    const lines = [
      `${till?.branch ?? "?"}  ${till?.code ?? "?"}`, "-".repeat(40),
      ...s.lines.map((l: { quantity: number; description: string; unitPrice: number }) => `${String(l.quantity).padStart(3)} x ${l.description.padEnd(18)} ${l.unitPrice.toFixed(2).padStart(10)}`),
      "-".repeat(40), `TOTAL ${s.currency}`.padEnd(28) + s.totalAmount.toFixed(2).padStart(12),
      `${s.kind === "CREDIT_NOTE" ? "CreditNote" : "FiscalInvoice"}  ${s.invoiceNumber ?? s.provisionalNumber ?? "(none)"}`,
      f ? `Device ${f.deviceId} ${f.deviceSerialNumber}` : "NOT FISCALISED",
      f ? `Receipt no ${f.receiptGlobalNo}  counter ${f.receiptCounter}  day ${f.fiscalDayNo}` : `Status ${s.status}: ${s.lastError ?? ""}`,
      f ? `Verification ${f.verificationCode}` : "", f ? f.qrCodeUrl : "",
    ];
    writeFileSync(join(dir, `${s.invoiceNumber ?? String(s._id)}.txt`), lines.join("\n"));
    csv.push([s.invoiceNumber ?? "", till?.branch ?? "", till?.code ?? "", dev?.zimraId ?? "", s.kind ?? "SALE", s.currency, s.totalAmount.toFixed(2), s.status, f?.receiptGlobalNo ?? "", f?.receiptCounter ?? "", f?.qrCodeUrl ?? ""].join(","));
  }
  writeFileSync(join(out, "index.csv"), csv.join("\n"));

  // ---- checks (6.3) -----------------------------------------------------------------------------------------------------
  check(drained1 && drained2, "every queue drained after the faults were cleared");
  const dupes = events.filter((e) => e.includes("DUPLICATE SALE")).length;
  check(dupes === 0, "a sale sent twice by a flaky till is stored once", String(dupes));
  const saleDocs = all.filter((s) => s.kind !== "CREDIT_NOTE");
  const creditDocs = all.filter((s) => s.kind === "CREDIT_NOTE");
  if (offlineProvisional.size) {
    const provs = [...offlineProvisional.values()];
    check(new Set(provs).size === provs.length, `offline tills: ${provs.length} leased provisional numbers are all different`);
    const byKey = new Map(saleDocs.map((d) => [d.idempotencyKey, d]));
    const kept = [...offlineProvisional].filter(([k, pn]) => byKey.get(k)?.provisionalNumber === pn).length;
    check(kept === provs.length, "offline tills: every sale kept the provisional number printed on its slip", `${kept}/${provs.length}`);
    const sold = saleDocs.filter((d) => offlineProvisional.has(d.idempotencyKey));
    check(sold.length === provs.length, "offline tills: each offline sale is stored exactly once", `${sold.length} vs ${provs.length}`);
    check(sold.every((d) => d.status === "FISCALISED" && !!d.invoiceNumber), "offline tills: every offline sale was fiscalised with a real invoice number");
  }
  check(saleDocs.length === sc.sales, "exactly one sale record per sale made", `${saleDocs.length} vs ${sc.sales}`);
  const notDone = all.filter((s) => s.status !== "FISCALISED");
  check(notDone.length === 0, "every sale and credit note is FISCALISED", notDone.slice(0, 3).map((s) => `${s.invoiceNumber}:${s.status}:${s.lastError}`).join("; "));
  check(all.filter((s) => s.needsReview).length === 0, "nothing is flagged for review");

  for (const d of devs.values()) {
    const label = `device ${d.id}`;
    const stored = gw.receipts(d.zimraId);
    const mine = all.filter((s) => s.status === "FISCALISED" && s.fiscalDeviceKey === d.appKey);
    check(stored.length === mine.length, `${label}: ZIMRA holds exactly one receipt per fiscalised sale`, `${stored.length} vs ${mine.length}`);
    let counterOk = true;
    let globalOk = true;
    stored.forEach((r, i) => {
      if (r.receipt.receiptCounter !== i + 1) counterOk = false;
      if (r.receipt.receiptGlobalNo !== stored[0]!.receipt.receiptGlobalNo + i) globalOk = false;
    });
    check(counterOk, `${label}: receipt counters run 1..n with no gap`);
    check(globalOk, `${label}: global numbers run on with no gap`);
    const flagged = stored.filter((r) => r.validationErrors.some((e) => ["Red", "Gray", "Yellow"].includes(String(e.validationErrorColor))));
    check(flagged.length === 0, `${label}: no Yellow, Gray or Red receipts`, flagged.slice(0, 2).map((r) => r.validationErrors.map((e) => e.validationErrorCode).join("/")).join(" | "));
    const inv = stored.map((r) => r.receipt.invoiceNo);
    check(new Set(inv).size === inv.length, `${label}: no invoice number appears twice at ZIMRA`);
    check(mine.every((s) => s.fiscal?.deviceId === String(d.zimraId) && (s.fiscal?.qrCodeUrl ?? "").includes(String(d.zimraId).padStart(10, "0"))), `${label}: every receipt carries its own device's id and QR`);
    const cl = closes.get(d.id)!;
    check(cl.ok, `${label}: the fiscal day closed from the app`, cl.message);
    if (cl.ok) {
      for (const [cur, got] of [["USD", cl.usd], ["ZWG", cl.zwg]] as const) {
        const want = mine.filter((s) => s.currency === cur && s.kind !== "CREDIT_NOTE").reduce((t, s) => t + s.totalAmount, 0);
        if (want === 0 && got == null) continue;
        check(Math.abs((got ?? 0) - want) < 0.01, `${label}: Z-report ${cur} sales equal the sales`, `${got} vs ${want.toFixed(2)}`);
      }
    }
  }
  // A credit note must be on the device that signed its original, even after a branch changed device.
  const byId = new Map(all.map((s) => [String(s._id), s]));
  const wrongDev = creditDocs.filter((cn) => byId.get(String(cn.originalSaleId))?.fiscal?.deviceId !== cn.fiscal?.deviceId);
  check(wrongDev.length === 0, "every credit note is on the device of its original", String(wrongDev.length));
  if (sc.flip) {
    const flippedBranch = branchIds.get(sc.flip.branch)!;
    const there = all.filter((s) => String(s.branchId) === flippedBranch && s.kind !== "CREDIT_NOTE");
    const devsUsed = new Set(there.map((s) => s.fiscal?.deviceId));
    check(devsUsed.size === 2, "the re-assigned branch's sales are split across exactly its old and new device", [...devsUsed].join(","));
    const keysAtSale = new Map(sales.map((s) => [s.id, s.deviceAtSale]));
    check(there.every((s) => s.fiscalDeviceKey === keysAtSale.get(String(s._id))), "every sale kept the device it was created with");
  }
  check(all.length === csv.length - 1, "a receipt file was written for every sale");

  const failed = results.filter((r) => !r.ok);
  const told = [...firstStatus.values()];
  const summary = [
    `# App stress run: ${sc.name}`, sc.description ?? "", "",
    `- Seed ${seed}, ${sc.sales} sales + ${creditDocs.length} credit notes, ${sc.concurrency} concurrent, ${tills.length} tills in ${sc.branches.length} branches on ${sc.devices.length} device(s)`,
    `- Load took ${((Date.now() - t0) / 1000).toFixed(1)} s; first answer to the till: ${told.filter((x) => x === "FISCALISED").length} fiscalised at once, ${told.filter((x) => x !== "FISCALISED").length} queued (slip printed, delivered later)`,
    "", "## Topology", ...sc.branches.map((b) => `- ${b.name}: ${b.tills} tills -> device ${b.device} (ZIMRA id ${devs.get(b.device)!.zimraId})${b.taxInclusive === false ? ", prices exclude tax" : ""}`),
    "", "## Checks", ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"}  ${r.label}${!r.ok && r.detail ? `  (${r.detail})` : ""}`),
    "", failed.length ? `**${failed.length} CHECK(S) FAILED**` : "**ALL CHECKS PASSED**",
  ].join("\n");
  writeFileSync(join(out, "summary.md"), summary);
  writeFileSync(join(out, "events.log"), events.join("\n"));
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.label}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
  console.log(`\n${failed.length ? `${failed.length} CHECK(S) FAILED` : "ALL CHECKS PASSED"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  receipts: ${out}`);

  await manager.shutdown();
  await new Promise<void>((r) => server.close(() => r()));
  await gw.stop();
  await svcDb.dropDatabase();
  await client.close();
  await m.connection.dropDatabase();
  await m.connection.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
