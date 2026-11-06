/**
 * Stress and chaos test for the fiscal service, driven entirely by a scenario file (settings, not code).
 *
 *   npm run stress -- scenarios/per-branch-devices.json [--sales=2000] [--concurrency=80] [--seed=7]
 *
 * It starts a fake ZIMRA gateway and a throw-away database, runs one real DeviceEngine per device, and fires
 * sales from many simulated tills at once while chaos happens (outages, lost replies, 5xx bursts, latency,
 * tills that send the same sale twice or late). It then heals everything, closes every device's fiscal day, and
 * checks the things that cause close-day errors. Every receipt is written to an output folder.
 *
 * Topology is just the scenario's `branches[].device`: all branches on one device, each on its own, or a mix.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

import { FetchTransport } from "../src/core/fetch-transport.js";
import { DeviceEngine, type Alert } from "../src/engine/engine.js";
import type { ReceiptResult, SubmitRequest } from "../src/engine/types.js";
import { FakeGateway } from "../src/testing/fake-gateway.js";
import { makeDeviceBundle } from "../src/testing/make-cert.js";

interface Scenario {
  name: string;
  description?: string;
  seed?: number;
  devices: { id: string; vatPayer?: boolean; keyType?: "rsa" | "ec" }[];
  branches: { name: string; device: string; tills: number }[];
  sales: number;
  concurrency: number;
  currencies?: Record<string, number>;
  creditNoteRate?: number;
  /** Fraction of tills with a poor connection: they send some sales twice, or late, or out of order. */
  flakyTillRate?: number;
  chaos?: {
    outages?: { device: string; fromPct: number; toPct: number }[];
    globalOutage?: { fromPct: number; toPct: number };
    dropReplyRate?: number;
    dropRequestRate?: number;
    serverErrors?: number;
    latencyMs?: number;
    jitterMs?: number;
    redReceipts?: number;
  };
  engine?: { waitMs?: number; retryBaseMs?: number; retryMaxMs?: number };
}

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run stress -- <scenario.json> [--sales=N] [--concurrency=N] [--seed=N]");
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = resolve("test-output", `stress-${sc.name}-${stamp}`);
mkdirSync(join(out, "receipts"), { recursive: true });
mkdirSync(join(out, "devices"), { recursive: true });
const events: string[] = [];
const ev = (m: string) => {
  const line = `${new Date().toISOString()} ${m}`;
  events.push(line);
  if (process.env.STRESS_VERBOSE) console.log(line);
};

const gw = new FakeGateway({ random: rand });
await gw.start();
gw.faults.closeDelayMs = 30;
const client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/").connect();
const db = client.db(`fiscal_stress_${randomBytes(4).toString("hex")}`);
const alerts: Alert[] = [];

console.log(`Scenario "${sc.name}": ${sc.sales} sales, ${sc.concurrency} concurrent, seed ${seed}. Output: ${out}`);

// ---- devices and engines ---------------------------------------------------------------------------------------
interface Dev {
  id: string;
  deviceId: number;
  engine: DeviceEngine;
}
const devs = new Map<string, Dev>();
let nextDeviceId = 9100;
for (const d of sc.devices) {
  const deviceId = ++nextDeviceId;
  const bundle = makeDeviceBundle(deviceId, d.keyType ?? "rsa");
  gw.addDevice(deviceId, bundle.serialNumber, bundle.certificatePem, { vatPayer: d.vatPayer ?? true });
  const engine = new DeviceEngine({
    db,
    deviceKey: `dev-${d.id}`,
    identity: { deviceId, serialNumber: bundle.serialNumber, privateKeyPem: bundle.privateKeyPem },
    transport: new FetchTransport(),
    baseUrl: gw.url,
    options: { maxDateDriftMs: 270_000, busyWaitMs: 60_000, waitMs: sc.engine?.waitMs ?? 4_000, retryBaseMs: sc.engine?.retryBaseMs ?? 40, retryMaxMs: sc.engine?.retryMaxMs ?? 400, openGapMs: 1_100, onRed: "continue", drainTimeoutMs: 120_000, closePollMs: 20, closePollTimeoutMs: 5_000 },
    alert: (a) => {
      alerts.push(a);
      ev(`ALERT ${a.kind} ${a.deviceKey}: ${a.message}`);
    },
  });
  await engine.init();
  await engine.openDay();
  engine.startBackground(100);
  devs.set(d.id, { id: d.id, deviceId, engine });
}
await sleep(1200); // let the gateway's own day-open time pass

// ---- tills ------------------------------------------------------------------------------------------------------
interface Till {
  branch: string;
  device: Dev;
  code: string;
  flaky: boolean;
}
const tills: Till[] = [];
for (const b of sc.branches) {
  const device = devs.get(b.device);
  if (!device) throw new Error(`Branch ${b.name} uses unknown device ${b.device}`);
  for (let i = 1; i <= b.tills; i++) tills.push({ branch: b.name, device, code: `T${i}`, flaky: rand() < (sc.flakyTillRate ?? 0) });
}

const items = [
  ["Bread", "1.50"], ["Milk 1L", "2.20"], ["Sugar 2kg", "3.40"], ["Rice 5kg", "6.80"], ["Cooking oil", "4.75"], ["Soap", "0.90"],
  ["Maize meal 10kg", "9.99"], ["Tea 100s", "2.35"], ["Eggs tray", "5.10"], ["Airtime", "1.00"], ["Battery AA", "1.25"], ["Candle", "0.60"],
] as const;
const currencies = Object.entries(sc.currencies ?? { USD: 1 });
const pickCurrency = () => {
  let r = rand() * currencies.reduce((s, [, w]) => s + w, 0);
  for (const [c, w] of currencies) if ((r -= w) <= 0) return c;
  return currencies[0]![0];
};
const toCents = (s: string) => Math.round(Number(s) * 100);
const fmt = (c: number) => (c / 100).toFixed(2);

interface Sale {
  n: number;
  till: Till;
  req: SubmitRequest;
  result?: ReceiptResult;
  /** What the till was told first: fiscalised at once, or queued (it printed with a valid QR and delivery followed). */
  first?: string;
}
let invoiceSeq = 0;
function makeSale(n: number): Sale {
  const till = pick(tills);
  const cur = pickCurrency();
  const k = 1 + Math.floor(rand() * 4);
  const lines = Array.from({ length: k }, () => {
    const [name, price] = pick([...items]);
    const scale = cur === "ZWG" ? 26 : 1;
    const unit = fmt(Math.round(toCents(price) * scale));
    return { name, unitPrice: unit, quantity: 1 + Math.floor(rand() * 3), taxId: 517, taxPercent: 15.5, hsCode: "99001000" };
  });
  const total = lines.reduce((s, l) => s + toCents(l.unitPrice) * l.quantity, 0);
  return {
    n,
    till,
    req: {
      tenantId: "company-1",
      invoiceNo: `${till.branch.slice(0, 3).toUpperCase()}-${till.code}-${String(++invoiceSeq).padStart(6, "0")}`,
      currency: cur,
      lines,
      payments: [{ moneyType: rand() < 0.8 ? "Cash" : "Card", amount: fmt(total) }],
      meta: { branchId: till.branch, tillId: till.code },
    },
  };
}

// ---- chaos timeline ---------------------------------------------------------------------------------------------
const c = sc.chaos ?? {};
gw.faults.dropReplyRate = c.dropReplyRate ?? 0;
gw.faults.dropRequestRate = c.dropRequestRate ?? 0;
gw.faults.delayMs = c.latencyMs ?? 0;
gw.faults.jitterMs = c.jitterMs ?? 0;
let progress = 0;
const outageOn = new Set<string>();
function applyChaos() {
  const pct = (progress / sc.sales) * 100;
  for (const o of c.outages ?? []) {
    const on = pct >= o.fromPct && pct < o.toPct;
    const d = devs.get(o.device)!;
    if (on && !outageOn.has(o.device)) {
      gw.faults.downDevices.add(d.deviceId);
      outageOn.add(o.device);
      ev(`CHAOS device ${o.device} goes down at ${pct.toFixed(0)}%`);
    } else if (!on && outageOn.has(o.device)) {
      gw.faults.downDevices.delete(d.deviceId);
      outageOn.delete(o.device);
      ev(`CHAOS device ${o.device} back up at ${pct.toFixed(0)}%`);
    }
  }
  const g = c.globalOutage;
  if (g) {
    const on = pct >= g.fromPct && pct < g.toPct;
    if (on !== gw.faults.down) {
      gw.faults.down = on;
      ev(`CHAOS ZIMRA ${on ? "unreachable" : "reachable again"} at ${pct.toFixed(0)}%`);
    }
  }
}
if (c.serverErrors) {
  const burst = () => {
    gw.faults.serverErrors = c.serverErrors!;
    ev(`CHAOS ${c.serverErrors} server errors`);
  };
  for (const at of [0.2, 0.5, 0.8]) setTimeout(burst, 0).unref();
  let k = 0;
  const t = setInterval(() => {
    if (++k % 3 === 0) burst();
  }, 700);
  t.unref();
}
if (c.redReceipts) for (let i = 0; i < c.redReceipts; i++) gw.faults.flagNext.push({ code: "RCPT099", colour: "Red" });

// ---- load -------------------------------------------------------------------------------------------------------
const sales = Array.from({ length: sc.sales }, (_, i) => makeSale(i));
let next = 0;
const t0 = Date.now();
const latencies: number[] = [];
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= sales.length) return;
    const s = sales[i]!;
    progress = i;
    applyChaos();
    const t = Date.now();
    if (s.till.flaky && rand() < 0.5) {
      // A till with a bad connection: the same sale arrives twice at once, or after a delay.
      if (rand() < 0.5) await sleep(Math.floor(rand() * 200));
      const [a, b] = await Promise.all([s.till.device.engine.submit(s.req), s.till.device.engine.submit(s.req)]);
      s.result = a.status === "fiscalised" ? a : b;
    } else {
      s.result = await s.till.device.engine.submit(s.req);
    }
    s.first = s.result.status;
    latencies.push(Date.now() - t);
  }
}
await Promise.all(Array.from({ length: sc.concurrency }, worker));
progress = sc.sales;
ev(`LOAD finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---- credit notes (same load style, after the sales) --------------------------------------------------------------
const credits: Sale[] = [];
async function settleAll() {
  gw.faults.down = false;
  gw.faults.downDevices.clear();
  gw.faults.dropReplyRate = 0;
  gw.faults.dropRequestRate = 0;
  gw.faults.delayMs = 0;
  gw.faults.jitterMs = 0;
  gw.faults.serverErrors = 0;
  for (const d of devs.values()) d.engine.kick();
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    const left = (await Promise.all([...devs.values()].map((d) => d.engine.status()))).reduce((s, x) => s + x.unsent, 0);
    if (left === 0) return true;
    await sleep(100);
  }
  return false;
}
ev("HEAL all faults cleared, draining queues");
const drained1 = await settleAll();

const ok = sales.filter((s) => s.result?.status === "fiscalised" || s.result?.status === "queued");
const toCredit = ok.filter(() => rand() < (sc.creditNoteRate ?? 0));
await Promise.all(
  toCredit.map(async (orig) => {
    const half = lines2(orig);
    const note: SubmitRequest = {
      tenantId: "company-1",
      invoiceNo: `CN-${orig.req.invoiceNo}`,
      receiptType: "CreditNote",
      currency: orig.req.currency,
      notes: "Customer return",
      original: { invoiceNo: orig.req.invoiceNo },
      lines: half,
      payments: [{ moneyType: "Cash", amount: fmt(-half.reduce((s, l) => s + Math.abs(toCents(l.unitPrice)) * l.quantity, 0)) }],
      meta: orig.req.meta,
    };
    const sale: Sale = { n: -1, till: orig.till, req: note };
    sale.result = await orig.till.device.engine.submit(note);
    sale.first = sale.result.status;
    credits.push(sale);
  })
);
function lines2(s: Sale) {
  const l = s.req.lines[0]!;
  return [{ ...l, unitPrice: fmt(-Math.abs(toCents(l.unitPrice))), quantity: 1 }];
}
const drained2 = await settleAll();

// ---- close every day ---------------------------------------------------------------------------------------------
ev("CLOSE closing every device's fiscal day");
const closes = new Map<string, Awaited<ReturnType<DeviceEngine["closeDay"]>>>();
for (const d of devs.values()) closes.set(d.id, await d.engine.closeDay());

// ---- write receipts ----------------------------------------------------------------------------------------------
function slip(s: Sale, r: ReceiptResult): string {
  const w = 40;
  const line = "-".repeat(w);
  const rows = s.req.lines.map((l) => `${String(l.quantity).padStart(2)} x ${l.name.padEnd(18)} ${l.unitPrice.padStart(10)}`);
  const total = s.req.payments.reduce((t, p) => t + toCents(p.amount), 0);
  return [
    `${s.till.branch}  ${s.till.code}`,
    line,
    ...rows,
    line,
    `TOTAL ${s.req.currency}`.padEnd(w - 12) + fmt(total).padStart(12),
    `${s.req.receiptType ?? "FiscalInvoice"}  ${s.req.invoiceNo}`,
    `Device ${r.deviceId} ${r.deviceSerialNumber}`,
    `Receipt no ${r.receiptGlobalNo}  counter ${r.receiptCounter}  day ${r.fiscalDayNo}`,
    `Verification code ${r.verificationCode}`,
    `QR: ${r.qrData}`,
    `Status: ${r.status}${r.colour && r.colour !== "none" ? ` (${r.colour})` : ""}`,
    "",
  ].join("\n");
}
const csv = ["invoiceNo,branch,till,device,currency,total,status,globalNo,counter,colour,qr"];
for (const s of [...sales, ...credits]) {
  const r = s.result;
  if (!r) continue;
  // Re-read the final state of the receipt from the engine (it may have been queued when first answered).
  const final = (await s.till.device.engine.getReceipt("company-1", s.req.invoiceNo)) ?? r;
  s.result = final;
  const dir = join(out, "receipts", s.till.branch, s.till.code);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${s.req.invoiceNo}.txt`), slip(s, final));
  const total = s.req.payments.reduce((t, p) => t + toCents(p.amount), 0);
  csv.push([s.req.invoiceNo, s.till.branch, s.till.code, s.till.device.deviceId, s.req.currency, fmt(total), final.status, final.receiptGlobalNo ?? "", final.receiptCounter ?? "", final.colour ?? "", final.qrData ?? ""].join(","));
}
writeFileSync(join(out, "index.csv"), csv.join("\n"));

// ---- checks ------------------------------------------------------------------------------------------------------
const results: { ok: boolean; label: string; detail?: string }[] = [];
const check = (ok: boolean, label: string, detail?: string) => results.push({ ok, label, detail });

check(drained1 && drained2, "every queue drained after the faults were cleared");
const all = [...sales, ...credits];
const fiscalised = all.filter((s) => s.result?.status === "fiscalised");
const refused = all.filter((s) => s.result?.status === "rejected");
check(all.every((s) => s.result?.status !== "queued"), "no sale is still waiting for ZIMRA");
check(refused.length === 0, "no sale was refused", refused.slice(0, 3).map((s) => `${s.req.invoiceNo}: ${s.result?.problems?.[0]?.code}`).join("; "));

const perDevice: Record<string, { sales: number; credits: number; receipts: number; maxConcurrent: number }> = {};
for (const d of devs.values()) {
  const stored = gw.receipts(d.deviceId);
  const mine = all.filter((s) => s.till.device.id === d.id && s.result?.status === "fiscalised");
  perDevice[d.id] = { sales: mine.filter((s) => s.n >= 0).length, credits: mine.filter((s) => s.n < 0).length, receipts: stored.length, maxConcurrent: gw.maxConcurrent.get(d.deviceId) ?? 0 };
  const label = `device ${d.id}`;
  check(stored.length === mine.length, `${label}: ZIMRA holds exactly one receipt per fiscalised sale`, `${stored.length} stored vs ${mine.length} sales`);
  let counterOk = true;
  let globalOk = true;
  stored.forEach((r, i) => {
    if (r.receipt.receiptCounter !== i + 1) counterOk = false;
    if (r.receipt.receiptGlobalNo !== stored[0]!.receipt.receiptGlobalNo + i) globalOk = false;
  });
  check(counterOk, `${label}: receipt counters run 1..n with no gap`);
  check(globalOk, `${label}: global numbers run on with no gap`);
  const flagged = stored.filter((r) => r.validationErrors.some((e) => ["Red", "Gray"].includes(String(e.validationErrorColor))));
  const expectedRed = c.redReceipts ?? 0;
  check(flagged.length <= expectedRed, `${label}: no Red or Gray receipts${expectedRed ? " beyond the injected ones" : ""}`, `${flagged.length}`);
  const yellow = stored.filter((r) => r.validationErrors.some((e) => e.validationErrorColor === "Yellow"));
  check(yellow.length === 0, `${label}: no Yellow receipts`, `${yellow.length}: ${[...new Set(yellow.flatMap((r) => r.validationErrors.map((e) => `${e.validationErrorCode}@#${r.receipt.receiptCounter} ${r.receipt.receiptDate} vs open ${gw.devices.get(d.deviceId)!.days[0]?.openedServer}`)))].slice(0, 3).join(" | ")}`);
  const invoiceNos = stored.map((r) => r.receipt.invoiceNo);
  check(new Set(invoiceNos).size === invoiceNos.length, `${label}: no invoice number appears twice at ZIMRA`);
  check(mine.every((s) => s.result!.deviceId === d.deviceId && s.result!.qrData!.includes(String(d.deviceId).padStart(10, "0"))), `${label}: every sale carries its own device's id and QR`);
  check(perDevice[d.id]!.maxConcurrent <= 2, `${label}: ZIMRA never saw more than 2 requests at once from this device`, String(perDevice[d.id]!.maxConcurrent));
  const cl = closes.get(d.id)!;
  if ((c.redReceipts ?? 0) > 0) check(!cl.ok && cl.reason === "RED_RECEIPTS", `${label}: the day with an injected Red receipt was NOT sent for closing`);
  else {
    check(cl.ok, `${label}: the fiscal day closed`, cl.ok ? "" : `${cl.reason}: ${cl.message}`);
    if (cl.ok) {
      for (const cur of new Set(mine.map((s) => s.req.currency))) {
        const sold = mine.filter((s) => s.req.currency === cur && s.n >= 0).reduce((t, s) => t + s.req.payments.reduce((a, p) => a + toCents(p.amount), 0), 0);
        const credited = mine.filter((s) => s.req.currency === cur && s.n < 0).reduce((t, s) => t + s.req.payments.reduce((a, p) => a + Math.abs(toCents(p.amount)), 0), 0);
        const z = cl.totals[cur];
        check(!!z && z.sales === fmt(sold) && z.credits === fmt(-credited), `${label}: Z-report totals for ${cur} equal the sales`, `${z?.sales}/${z?.credits} vs ${fmt(sold)}/${fmt(-credited)}`);
      }
    }
  }
}
const slipsWritten = csv.length - 1;
check(slipsWritten === all.filter((s) => s.result).length, "a receipt file was written for every sale");

latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] ?? 0;

const failed = results.filter((r) => !r.ok);
const summary = [
  `# Stress run: ${sc.name}`,
  sc.description ?? "",
  "",
  `- Seed ${seed}, ${sc.sales} sales + ${credits.length} credit notes, ${sc.concurrency} concurrent, ${tills.length} tills in ${sc.branches.length} branches on ${sc.devices.length} device(s)`,
  `- Load took ${((Date.now() - t0) / 1000).toFixed(1)} s; answer time p50 ${pct(50)} ms, p95 ${pct(95)} ms, max ${pct(100)} ms`,
  `- Told at once: ${all.filter((s) => s.first === "fiscalised").length} fiscalised by ZIMRA, ${all.filter((s) => s.first === "queued").length} queued (printed with a valid QR while ZIMRA was out of reach, delivered later), ${all.filter((s) => s.first === "rejected").length} refused`,
  `- Alerts raised: ${alerts.length}${alerts.length ? ` (${[...new Set(alerts.map((a) => a.kind))].join(", ")})` : ""}`,
  "",
  "## Topology",
  ...sc.branches.map((b) => `- ${b.name}: ${b.tills} tills -> device ${b.device} (ZIMRA id ${devs.get(b.device)!.deviceId})`),
  "",
  "## Per device",
  ...Object.entries(perDevice).map(([k, v]) => `- ${k}: ${v.sales} sales + ${v.credits} credit notes, ${v.receipts} receipts at ZIMRA, max ${v.maxConcurrent} concurrent requests`),
  "",
  "## Checks",
  ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"}  ${r.label}${!r.ok && r.detail ? `  (${r.detail})` : ""}`),
  "",
  failed.length ? `**${failed.length} CHECK(S) FAILED**` : "**ALL CHECKS PASSED**",
].join("\n");
writeFileSync(join(out, "summary.md"), summary);
writeFileSync(join(out, "events.log"), events.join("\n"));
for (const d of devs.values()) writeFileSync(join(out, "devices", `${d.id}.json`), JSON.stringify({ deviceId: d.deviceId, status: await d.engine.status(), close: closes.get(d.id), perDevice: perDevice[d.id] }, null, 2));

for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.label}${!r.ok && r.detail ? `  -> ${r.detail}` : ""}`);
console.log(`\n${failed.length ? `${failed.length} CHECK(S) FAILED` : "ALL CHECKS PASSED"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  receipts: ${out}`);

for (const d of devs.values()) await d.engine.shutdown();
await gw.stop();
await db.dropDatabase();
await client.close();
process.exit(failed.length ? 1 : 0);
