/**
 * Multi-device POS stress test. Runs entirely against FAKE Virtual Devices on local ports and a throw-away
 * database (dropped at the end); it never touches a real device, the live database or your dev data.
 *
 *   npm run pos:simulate:multi                       default: 300 sales
 *   npm run pos:simulate:multi -- --n=1000 --concurrency=60 --ms=40
 *
 * Setup: 5 branches over 3 devices (central: Harare + Gweru, device B: Bulawayo + Mutare, device C: Victoria Falls,
 * which also needs a login). Many tills sell at once in USD and ZWG, then:
 *   - device B is switched OFF for a while mid-run
 *   - device C silently drops ~4% of its replies AFTER recording the receipt (the dangerous "unknown outcome")
 *   - ~10% of sales are credited
 * and it verifies, from the devices' own records and the printed slips:
 *   every sale is fiscalised on the device of ITS branch and nowhere else; every receipt carries that device's
 *   ID, serial and QR; device receipt numbers are gapless; no duplicate receipts after recovery; credit notes reach
 *   the original's device; slips and A4 invoices print the right device; Z-reports match per device.
 */
import * as dotenv from "dotenv";
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Isolation first: a fixed throw-away database on the LOCAL server only. Never the live URI.
const SIM_DB = "pos_multi_sim_tmp";
process.env.MONGO_DB_NAME = SIM_DB;
process.env.MONGODB_URI = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.OFFLINE_MONGODB_URI = process.env.MONGODB_URI;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;

const arg = (name: string, dflt: number) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? Number(m.split("=")[1]) : dflt;
};
const N = arg("n", 300);
const CONCURRENCY = arg("concurrency", 30);
const DEVICE_MS = arg("ms", 60); // per-receipt processing time on a device (it handles one at a time)

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

// ---------------------------------------------------------------------------------------------------------------
// A fake Virtual Device: one receipt at a time (like the real one), contiguous global numbers, one-way invoice
// numbers, and switches to go down or lose replies.
// ---------------------------------------------------------------------------------------------------------------
interface Rec {
  invoiceNo: string;
  type: string;
  currency: string;
  total: number;
  globalNo: number;
  /** What the till sent; a real device returns the receipt's lines on every lookup too. */
  lines: unknown;
}
interface Fake {
  name: string;
  port: number;
  deviceId: string;
  serial: string;
  token?: string;
  dropRate: number;
  dropped: number;
  duplicateRejections: number;
  unauthorised: number;
  receipts: Rec[];
  day: number;
  dayOpen: boolean;
  server?: http.Server;
  chain: Promise<unknown>;
}
const pad10 = (n: number) => String(n).padStart(10, "0");

function envelope(f: Fake, r: Rec) {
  const code = `X${f.deviceId}${r.globalNo}`.slice(-8).toUpperCase().padStart(8, "X");
  return {
    Code: "1",
    DeviceID: f.deviceId,
    DeviceSerialNumber: f.serial,
    FiscalDayNo: f.day,
    VerificationCode: code,
    VerificationLink: `https://fdmstest.zimra.co.zw/${code}`,
    QRCode: `https://fdmstest.zimra.co.zw/${f.deviceId}${pad10(r.globalNo)}${code}`,
    Data: {
      receipt: {
        receiptGlobalNo: r.globalNo,
        receiptCounter: r.globalNo,
        invoiceNo: `${f.deviceId}-${r.invoiceNo}`,
        receiptDate: new Date().toISOString(),
        receiptTotal: r.total,
        receiptCurrency: r.currency,
        receiptLines: r.lines,
      },
    },
  };
}

function startFake(f: Fake): Promise<void> {
  return new Promise((resolve) => {
    f.server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        const send = (o: unknown, s = 200) => {
          res.writeHead(s, { "Content-Type": "application/json" });
          res.end(JSON.stringify(o));
        };
        const p = new URL(req.url ?? "/", "http://x").pathname;
        if (p === "/api/Auth/login") return send({ token: f.token ?? "none" });
        if (f.token && req.headers["authorization"] !== `Bearer ${f.token}`) {
          f.unauthorised++;
          return send({ message: "Unauthorized" }, 401);
        }
        if (p.endsWith("/GetStatus"))
          return send({ Code: "1", FiscalDayNo: f.day, Data: { fiscalDayStatus: f.dayOpen ? "FiscalDayOpened" : "FiscalDayClosed", lastReceiptGlobalNo: f.receipts.length } });
        if (p.endsWith("/OpenFiscalDay")) {
          if (f.dayOpen) return send({ Code: "0", Message: "Fiscal day already open" });
          f.day++;
          f.dayOpen = true;
          return send({ Code: "1", FiscalDayNo: f.day });
        }
        if (p.endsWith("/CloseFiscalDay")) {
          if (!f.dayOpen) return send({ Code: "0", Message: "Fiscal day is closed" });
          f.dayOpen = false;
          const totals: Record<string, number> = {};
          for (const r of f.receipts) totals[r.currency] = Math.round(((totals[r.currency] ?? 0) + r.total) * 100) / 100;
          return send({
            Code: "1",
            FiscalDayNo: f.day,
            Data: { fiscalDayNo: f.day, counters: Object.entries(totals).map(([currency, total]) => ({ currency, total })) },
          });
        }
        if (p.endsWith("/GetUnProcessedInvoicesSummary")) return send({ Code: "1", Data: { TotalRecords: 0 } });
        if (p.endsWith("/GetConfig")) return send({ Code: "1", DeviceID: f.deviceId, DeviceSerialNumber: f.serial, Data: { deviceSerialNo: f.serial } });
        if (p.includes("/GetInvoice/")) {
          const n = decodeURIComponent(p.split("/GetInvoice/")[1]);
          const r = f.receipts.find((x) => x.invoiceNo === n);
          return send(r ? envelope(f, r) : { Code: "0", Message: "Invoice not found" });
        }
        if (p.endsWith("/SubmitReceipt") || p.endsWith("/SubmitReceiptExt")) {
          // One receipt at a time, each taking DEVICE_MS, like the real device.
          f.chain = f.chain.then(async () => {
            await sleep(DEVICE_MS * (0.6 + Math.random() * 0.8));
            const body = JSON.parse(raw || "{}") as Record<string, unknown>;
            if (!f.dayOpen) return send({ Code: "0", Message: "Fiscal day is closed. Open the fiscal day first" });
            const invoiceNo = String(body["invoiceNo"]);
            if (f.receipts.some((r) => r.invoiceNo === invoiceNo)) {
              f.duplicateRejections++;
              return send({ Code: "0", Message: "Invoice already exists" });
            }
            const r: Rec = {
              invoiceNo,
              type: String(body["receiptType"]),
              currency: String(body["receiptCurrency"]),
              total: Number(body["invoiceAmount"]),
              globalNo: f.receipts.length + 1,
              lines: body["receiptLines"] ?? [],
            };
            f.receipts.push(r);
            if (Math.random() < f.dropRate) {
              // The receipt IS recorded, but the reply never reaches the till.
              f.dropped++;
              res.socket?.destroy();
              return;
            }
            send(envelope(f, r));
          });
          return;
        }
        send({ Code: "0", Message: `No route ${p}` }, 404);
      });
    });
    f.server.listen(f.port, "127.0.0.1", () => resolve());
  });
}
const stopFake = (f: Fake) =>
  new Promise<void>((resolve) => {
    if (!f.server) return resolve();
    f.server.closeAllConnections?.();
    f.server.close(() => resolve());
    f.server = undefined;
  });

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log(`\nMulti-device POS simulation: ${N} sales, ${CONCURRENCY} concurrent tills, ~${DEVICE_MS} ms/receipt per device\n`);

  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: ZReport } = await import("@/database/zReport.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const dev = await import("@/lib/services/fiscalDevice.service");
  const pos = await import("@/lib/services/posSale.service");
  const ops = await import("@/lib/services/fiscalDayOps.service");
  const { slipBodyHtml } = await import("@/lib/pos/slip");
  const { a4BodyHtml } = await import("@/lib/pos/a4");

  const m = await dbConnect();
  await m.connection.dropDatabase();

  const mk = (name: string, port: number, deviceId: string, serial: string, token?: string, dropRate = 0): Fake => ({
    name, port, deviceId, serial, token, dropRate, dropped: 0, duplicateRejections: 0, unauthorised: 0,
    receipts: [], day: 0, dayOpen: false, chain: Promise.resolve(),
  });
  const central = mk("central", 19401, "1001", "VR-CENTRAL");
  const devB = mk("Device B", 19402, "2002", "VR-BULAWAYO");
  const devC = mk("Device C", 19403, "3003", "VR-VICFALLS", "tok-C", 0.04);
  const fakes = [central, devB, devC];
  for (const f of fakes) await startFake(f);

  // ---- configuration: central settings, two devices, five branches
  await FiscalSettings.create({ zimraApiUrl: `http://127.0.0.1:${central.port}`, deviceId: central.deviceId, deviceSerialNumber: central.serial });
  const dB = await dev.createFiscalDevice({ name: "Bulawayo device", zimraApiUrl: `http://127.0.0.1:${devB.port}`, deviceId: devB.deviceId, deviceSerialNumber: devB.serial });
  const dC = await dev.createFiscalDevice({ name: "Victoria Falls device", zimraApiUrl: `http://127.0.0.1:${devC.port}`, deviceId: devC.deviceId, deviceSerialNumber: devC.serial, vdEmail: "vf@sim", vdPassword: "sim-password" });
  const storeId = new m.Types.ObjectId();
  const defs = [
    { name: "Harare", prefix: "H", fake: central, key: "central" },
    { name: "Gweru", prefix: "G", fake: central, key: "central" },
    { name: "Bulawayo", prefix: "B", fake: devB, key: dB.id },
    { name: "Mutare", prefix: "M", fake: devB, key: dB.id },
    { name: "Victoria Falls", prefix: "V", fake: devC, key: dC.id },
  ];
  const branches: { id: string; prefix: string; fake: Fake; key: string; name: string }[] = [];
  for (const d of defs) {
    const b = await Branch.create({
      name: d.name, storeId, location: d.name,
      pos: { enabled: true, invoicePrefix: d.prefix, taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD" },
    });
    if (d.key !== "central") await dev.assignBranchDevice(String(b._id), d.key);
    branches.push({ id: String(b._id), prefix: d.prefix, fake: d.fake, key: d.key, name: d.name });
  }
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });
  for (const k of ["central", dB.id, dC.id]) await ops.openFiscalDayOnly(k);
  console.log(`Branches: ${branches.map((b) => `${b.name}->${b.fake.name}`).join(", ")}\n`);

  // ---- load: concurrent tills, with an outage of device B and lost replies on device C
  const words = ["Bread", "Milk", "Sugar", "Rice", "Cooking oil", "Soap", "Maize meal", "Tea", "Eggs", "Airtime", "Battery", "Candle"];
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const cashier = String(new m.Types.ObjectId());
  const plan = Array.from({ length: N }, (_, i) => {
    const br = branches[rnd(0, branches.length - 1)];
    return {
      i,
      br,
      body: {
        branchId: br.id,
        cashierId: cashier,
        idempotencyKey: `sim-${i}-${randomBytes(4).toString("hex")}`,
        currency: (Math.random() < 0.7 ? "USD" : "ZWG") as "USD" | "ZWG",
        paymentMethod: (Math.random() < 0.8 ? "CASH" : "CARD") as "CASH" | "CARD",
        isTest: true,
        lines: Array.from({ length: rnd(1, 5) }, () => ({
          description: words[rnd(0, words.length - 1)],
          quantity: rnd(1, 4),
          unitPrice: rnd(50, 9000) / 100,
        })),
      },
    };
  });

  const lat: Record<string, number[]> = { central: [], [dB.id]: [], [dC.id]: [] };
  const latDuringOutage: number[] = []; // non-B sales while device B was off
  const latOutsideOutage: number[] = []; // the same devices' sales the rest of the time (their own queueing)
  const statusAfter = new Map<number, string>();
  let outage = false;
  let next = 0;
  let outageDone = false;

  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= plan.length) return;
      // Device B goes off at 35% of the run and comes back at 60%.
      if (idx === Math.floor(N * 0.35) && !outage && !outageDone) {
        outage = true;
        await stopFake(devB);
      }
      if (idx === Math.floor(N * 0.6) && outage) {
        outage = false;
        outageDone = true;
        await startFake(devB);
      }
      const p = plan[idx];
      const t = Date.now();
      const wasOutage = outage;
      const sale = await pos.createPosSale(p.body);
      const dt = Date.now() - t;
      lat[p.br.key].push(dt);
      if (p.br.key !== dB.id) (wasOutage ? latDuringOutage : latOutsideOutage).push(dt);
      statusAfter.set(idx, sale.status);
    }
  };
  const tLoad = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const loadMs = Date.now() - tLoad;
  if (outage) await startFake(devB);

  const firstPass = { fiscalised: 0, queued: 0 };
  for (const s of statusAfter.values()) {
    if (s === "FISCALISED") firstPass.fiscalised++;
    else firstPass.queued++;
  }
  console.log(`Load finished in ${(loadMs / 1000).toFixed(1)}s: ${firstPass.fiscalised} fiscalised at once, ${firstPass.queued} queued (device B outage / lost replies)\n`);

  // ---- let the background queue heal everything (time is faked by back-dating the retry back-off)
  let rounds = 0;
  for (; rounds < 30; rounds++) {
    await PosSale.collection.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 3_600_000) } });
    const q = await pos.runPosQueue(500);
    const left = await PosSale.countDocuments({ status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] } });
    if (left === 0 && q.stillPending === 0) break;
  }

  // ---- credit ~10% of sales
  const toCredit = (await PosSale.find({ status: "FISCALISED", kind: { $ne: "CREDIT_NOTE" } }).select("_id").limit(Math.ceil(N * 0.1)).lean()) as unknown as { _id: unknown }[];
  const cns = await Promise.all(toCredit.map((s) => pos.issueCreditNote(String(s._id), cashier, "simulation")));
  for (let r = 0; r < 10; r++) {
    await PosSale.collection.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 3_600_000) } });
    await pos.runPosQueue(500);
    if ((await PosSale.countDocuments({ status: { $in: ["PENDING", "SUBMITTING", "UNFISCALISED", "UNKNOWN"] } })) === 0) break;
  }

  // =============================================================================================================
  // Verification
  // =============================================================================================================
  console.log("Results");
  type S = {
    _id: unknown; status: string; kind?: string; branchId: unknown; invoiceNumber?: string; currency: string; totalAmount: number;
    fiscalDeviceKey?: string; originalSaleId?: unknown;
    fiscal?: { deviceId?: string; deviceSerialNumber?: string; receiptGlobalNo?: string; qrCodeUrl?: string; verificationCode?: string; fiscalDayNo?: number | null };
    lines: unknown[]; buyer?: unknown; soldAt: Date; paymentMethod: string; subtotalExclTax: number; totalVat: number; creditReason?: string; originalNumber?: string;
  };
  const sales = (await PosSale.find().lean()) as unknown as S[];
  const byBranch = new Map(branches.map((b) => [b.id, b]));
  const states = sales.reduce<Record<string, number>>((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});
  console.log(`  sales by status: ${JSON.stringify(states)}  (${rounds} queue rounds, ${cns.length} credit notes)`);
  check(sales.length === N + cns.length, `all ${N} sales and ${cns.length} credit notes were recorded`, { have: sales.length });
  check(sales.every((s) => s.status === "FISCALISED"), "every sale and credit note ended FISCALISED (none lost, none FAILED)", states);

  // 1. each sale sits on its own branch's device, and nowhere else
  const wrongDevice: string[] = [];
  const receiptsOn = (f: Fake, inv?: string) => f.receipts.filter((r) => r.invoiceNo === inv);
  for (const s of sales) {
    const b = byBranch.get(String(s.branchId))!;
    const ok =
      s.fiscal?.deviceId === b.fake.deviceId &&
      s.fiscal?.deviceSerialNumber === b.fake.serial &&
      (s.fiscalDeviceKey ?? "central") === b.key &&
      receiptsOn(b.fake, s.invoiceNumber).length === 1 &&
      fakes.filter((f) => f !== b.fake).every((f) => receiptsOn(f, s.invoiceNumber).length === 0);
    if (!ok) wrongDevice.push(`${s.invoiceNumber}@${b.name}`);
  }
  check(wrongDevice.length === 0, "every receipt carries its branch's device ID + serial, exists exactly once on that device, and on no other", wrongDevice.slice(0, 5));

  // 2. the device's own numbering is gapless and matches what we stored
  for (const f of fakes) {
    const nums = f.receipts.map((r) => r.globalNo);
    check(nums.every((n, i) => n === i + 1), `${f.name} (ID ${f.deviceId}): receipt numbers 1..${nums.length} with no gaps or repeats`);
  }
  const mismatch = sales.filter((s) => {
    const b = byBranch.get(String(s.branchId))!;
    const r = receiptsOn(b.fake, s.invoiceNumber)[0];
    return !r || String(r.globalNo) !== s.fiscal?.receiptGlobalNo || Math.abs(Math.abs(r.total) - Math.abs(s.totalAmount)) > 0.005 || r.currency !== s.currency;
  });
  check(mismatch.length === 0, "each stored fiscal number, total and currency matches the device's own record", mismatch.slice(0, 3).map((s) => s.invoiceNumber));

  // 3. QR codes are built from the right device
  const badQr = sales.filter((s) => {
    const b = byBranch.get(String(s.branchId))!;
    const qr = (s.fiscal?.qrCodeUrl ?? "").replace(/\s/g, "");
    return !qr.includes(`${b.fake.deviceId}${pad10(Number(s.fiscal?.receiptGlobalNo))}`) || !qr.toUpperCase().endsWith((s.fiscal?.verificationCode ?? "?").replace(/-/g, "").toUpperCase());
  });
  check(badQr.length === 0, "every QR contains its own device ID and receipt number and ends with its verification code", badQr.slice(0, 3).map((s) => s.invoiceNumber));

  // 4. invoice numbers: unique, right prefix
  const nums = sales.map((s) => s.invoiceNumber!);
  check(new Set(nums).size === nums.length, "no invoice number is used twice anywhere");
  check(sales.every((s) => s.invoiceNumber!.startsWith(byBranch.get(String(s.branchId))!.prefix)), "every invoice number starts with its branch's prefix");

  // 5. printed output names the right device
  let badPrint = 0;
  for (const s of sales) {
    const b = byBranch.get(String(s.branchId))!;
    const others = fakes.filter((f) => f !== b.fake);
    const slip = slipBodyHtml(s as never, {}, {});
    const a4 = a4BodyHtml(s as never, {}, {});
    const okSlip = slip.includes(`Device ID</span><b>${b.fake.deviceId}</b>`) && slip.includes(`Serial No</span><b>${b.fake.serial}</b>`) && others.every((o) => !slip.includes(o.serial));
    const okA4 = a4.includes(b.fake.deviceId) && a4.includes(b.fake.serial) && others.every((o) => !a4.includes(o.serial));
    if (!okSlip || !okA4) badPrint++;
  }
  check(badPrint === 0, `${sales.length} printed slips and A4 invoices show the correct device ID and serial (and no other device's)`, { badPrint });

  // 6. credit notes went to the original's device
  const badCn = cns.filter((c) => {
    const orig = sales.find((s) => String(s._id) === String(c.originalSaleId))!;
    const b = byBranch.get(String(c.branchId))!;
    const cs = sales.find((s) => String(s._id) === String(c._id))!;
    return !orig || cs.fiscal?.deviceId !== orig.fiscal?.deviceId || receiptsOn(b.fake, cs.invoiceNumber)[0]?.type !== "CreditNote";
  });
  check(badCn.length === 0, `all ${cns.length} credit notes were issued on the device that signed the original`, badCn.length);

  // 7. isolation and the hard cases
  const bQueued = plan.filter((p, i) => p.br.key === dB.id && statusAfter.get(i) !== "FISCALISED").length;
  check(bQueued > 0, `device B's outage was real: ${bQueued} of its sales had to be queued`);
  const nonBQueued = plan.filter((p, i) => p.br.key !== dB.id && p.br.key !== dC.id && statusAfter.get(i) !== "FISCALISED").length;
  check(nonBQueued === 0, "the central device's sales were never held back by device B being down", { nonBQueued });
  // A busy device queues its own receipts (one at a time), so compare with the same devices outside the outage.
  const base95 = pct(latOutsideOutage, 95);
  check(
    latDuringOutage.length === 0 || pct(latDuringOutage, 95) <= base95 * 1.5 + 500,
    `device B being down did not slow the other devices (p95 ${pct(latDuringOutage, 95)} ms during the outage vs ${base95} ms otherwise, ${latDuringOutage.length} sales)`
  );
  check(devC.dropped > 0 || N < 100, `device C really lost ${devC.dropped} replies after recording the receipt`);
  check(devC.duplicateRejections >= 0 && devC.receipts.length === new Set(devC.receipts.map((r) => r.invoiceNo)).size, "lost replies were recovered without creating a duplicate receipt on device C", { duplicateRejections: devC.duplicateRejections });
  check(devC.unauthorised === 0, "device C always presented its own login and no other device's");
  const soldNumbers = new Set(sales.map((s) => s.invoiceNumber));
  const surplus = fakes.flatMap((f) => f.receipts.filter((r) => !soldNumbers.has(r.invoiceNo)).map((r) => `${f.name}:${r.invoiceNo}`));
  check(fakes.reduce((n, f) => n + f.receipts.length, 0) === sales.length && surplus.length === 0, "total receipts across all devices equals sales + credit notes exactly (no orphan or doubled receipts)", surplus.slice(0, 6));

  // 8. close every device's day: Z-reports per device, totals agree
  for (const [k, f] of [["central", central], [dB.id, devB], [dC.id, devC]] as [string, Fake][]) {
    const z = await ops.closeFiscalDayWithReport("manual", { deviceKey: k });
    const net = (cur: string) => Math.round(sales.filter((s) => byBranch.get(String(s.branchId))!.fake === f && s.currency === cur).reduce((a, s) => a + s.totalAmount, 0) * 100) / 100;
    check(z.fiscalDeviceKey === k && z.deviceId === f.deviceId, `${f.name}: Z-report is tagged to this device (ID ${f.deviceId})`);
    check(Math.abs((z.totalSalesUsd ?? 0) - net("USD")) < 0.01 && Math.abs((z.totalSalesZwg ?? 0) - net("ZWG")) < 0.01, `${f.name}: Z-report totals equal the branches' net sales (USD ${net("USD")}, ZWG ${net("ZWG")})`, { usd: z.totalSalesUsd, zwg: z.totalSalesZwg });
  }
  check((await ZReport.countDocuments()) === 3, "exactly one Z-report per device");

  // ---- report
  const secs = (Date.now() - t0) / 1000;
  console.log("\nPer device");
  console.log("  device                 ID    serial          receipts  dropped replies  latency p50 / p95 / max (ms)");
  for (const [k, f] of [["central", central], [dB.id, devB], [dC.id, devC]] as [string, Fake][]) {
    const l = lat[k];
    console.log(`  ${f.name.padEnd(20)} ${f.deviceId.padEnd(5)} ${f.serial.padEnd(15)} ${String(f.receipts.length).padStart(8)} ${String(f.dropped).padStart(16)}    ${pct(l, 50)} / ${pct(l, 95)} / ${Math.max(0, ...l)}`);
  }
  console.log(`\nThroughput: ${(N / (loadMs / 1000)).toFixed(1)} sales/s under load. Total run ${secs.toFixed(1)}s.`);
  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);

  for (const f of fakes) await stopFake(f);
  await m.connection.dropDatabase();
  await m.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SIMULATION CRASHED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
