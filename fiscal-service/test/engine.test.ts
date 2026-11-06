import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { MongoClient, type Db } from "mongodb";

import { FetchTransport } from "../src/core/fetch-transport.js";
import { DeviceEngine, type Alert, type EngineOptions } from "../src/engine/engine.js";
import type { SubmitRequest } from "../src/engine/types.js";
import { FakeGateway } from "../src/testing/fake-gateway.js";
import { makeDeviceBundle, opensslAvailable } from "../src/testing/make-cert.js";

const have = opensslAvailable();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("device engine", { skip: !have }, () => {
  const gw = new FakeGateway();
  let client: MongoClient;
  let db: Db;
  let nextId = 5000;
  const alerts: Alert[] = [];

  before(async () => {
    await gw.start();
    gw.faults.closeDelayMs = 20;
    client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 3000 }).connect();
    db = client.db(`fiscal_engine_test_${randomBytes(4).toString("hex")}`);
  });
  after(async () => {
    await gw.stop();
    await db?.dropDatabase();
    await client?.close();
  });

  const fast: Partial<EngineOptions> = { waitMs: 2_000, retryBaseMs: 30, retryMaxMs: 200, openGapMs: 1_100, drainTimeoutMs: 3_000, closePollMs: 20, closePollTimeoutMs: 3_000 };

  async function boot(opts: Partial<EngineOptions> = {}, open = true, vatPayer = true, existing?: { deviceId: number; keyPem: string; serial: string; key: string }) {
    const id = existing?.deviceId ?? ++nextId;
    const b = existing ? undefined : makeDeviceBundle(id);
    if (b) gw.addDevice(id, b.serialNumber, b.certificatePem, { vatPayer });
    const make = async () => {
      const e = new DeviceEngine({
        db,
        deviceKey: existing?.key ?? `dev-${id}`,
        identity: { deviceId: id, serialNumber: existing?.serial ?? b!.serialNumber, privateKeyPem: existing?.keyPem ?? b!.privateKeyPem },
        transport: new FetchTransport(),
        baseUrl: gw.url,
        options: { ...fast, ...opts },
        alert: (a) => alerts.push(a),
      });
      await e.init();
      return e;
    };
    const engine = await make();
    if (open) await engine.openDay();
    return { engine, id, make, key: `dev-${id}`, serial: b?.serialNumber ?? existing!.serial, keyPem: b?.privateKeyPem ?? existing!.keyPem };
  }

  const tenant = () => `t-${randomBytes(3).toString("hex")}`;
  let n = 0;
  const req = (t: string, over: Partial<SubmitRequest> = {}, price = "10.00"): SubmitRequest => ({
    tenantId: t,
    invoiceNo: `INV-${++n}`,
    currency: "USD",
    lines: [{ name: "Bread", unitPrice: price, quantity: 1, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }],
    payments: [{ moneyType: "Cash", amount: price }],
    ...over,
  });
  const waitFor = async (fn: () => Promise<boolean>, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await sleep(25);
    }
    return false;
  };
  const gapless = (id: number) => {
    const r = gw.receipts(id).map((x) => x.receipt);
    r.forEach((x, i) => {
      assert.equal(x.receiptCounter, i + 1, `counter ${i + 1}`);
    });
    const g = r.map((x) => x.receiptGlobalNo);
    g.forEach((v, i) => assert.equal(v, g[0]! + i, `global number at ${i}`));
    assert.ok(gw.receipts(id).every((x) => x.validationErrors.length === 0), "no validation errors of any colour");
  };

  it("fiscalises a receipt, gives the QR at once, and closes the day", async () => {
    const t = tenant();
    const { engine, id } = await boot();
    const r = await engine.submit(req(t));
    assert.equal(r.status, "fiscalised");
    assert.match(r.qrData!, /^https:\/\/fdmstest\.zimra\.co\.zw\/00000/);
    assert.equal(r.receiptGlobalNo, 1);
    assert.equal(r.colour, "none");
    gapless(id);
    const c = await engine.closeDay();
    assert.ok(c.ok, JSON.stringify(c));
    if (c.ok) assert.equal(c.totals["USD"]!.count, 1);
    assert.equal(gw.devices.get(id)!.status, "FiscalDayClosed");
  });

  // Seen on the real ZIMRA test gateway on 2026-11-06 (acceptance rehearsal). The fake gateway now enforces both rules.
  it("tax is worked out per tax group like ZIMRA: odd-cent multi-line receipts, inclusive and exclusive, are not flagged", async () => {
    const t = tenant();
    const { engine, id } = await boot();
    const lines = (rows: [string, number][]): SubmitRequest["lines"] => rows.map(([p, q]) => ({ name: "Item", unitPrice: p, quantity: q, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }));
    // inclusive 0.90 x3 + 3.40 + 2.20 = 8.30; line by line the tax is 1.12, for the group it is 1.11
    const a = await engine.submit({ tenantId: t, invoiceNo: `INV-${++n}`, currency: "USD", lines: lines([["0.90", 3], ["3.40", 1], ["2.20", 1]]), payments: [{ moneyType: "Cash", amount: "8.30" }] });
    // exclusive 1.50 + 4.75 + 1.50 x2 = 9.25 net; group tax 1.43, total 10.68 (line by line 1.44 and 10.69)
    const b = await engine.submit({ tenantId: t, invoiceNo: `INV-${++n}`, currency: "USD", taxInclusive: false, lines: lines([["1.50", 1], ["4.75", 1], ["1.50", 2]]), payments: [{ moneyType: "Cash", amount: "10.68" }] });
    assert.equal(a.status, "fiscalised", JSON.stringify(a));
    assert.equal(b.status, "fiscalised", JSON.stringify(b));
    assert.ok(await waitFor(async () => gw.receipts(id).length === 2));
    assert.ok(gw.receipts(id).every((x) => x.validationErrors.length === 0), JSON.stringify(gw.receipts(id).map((x) => x.validationErrors)));
    assert.equal(gw.receipts(id)[0]!.receipt.receiptTaxes[0]!.taxAmount, 1.11);
    assert.equal(gw.receipts(id)[1]!.receipt.receiptTaxes[0]!.taxAmount, 1.43);
  });

  it("a cash sale arrives with an empty buyer block and is sent as no buyer; a buyer without email or phone is refused BEFORE a number is used", async () => {
    const t = tenant();
    const { engine, id } = await boot();
    const cash = await engine.submit(req(t, { buyer: { buyerContacts: {}, buyerAddress: {} } as never }));
    assert.equal(cash.status, "fiscalised", JSON.stringify(cash));
    assert.equal(gw.receipts(id)[0]!.receipt.buyerData ?? null, null, "no buyer block reached the gateway");
    const bad = await engine.submit(req(t, { buyer: { buyerRegisterName: "Example Traders", buyerTIN: "2000999888" } }));
    assert.equal(bad.status, "rejected");
    assert.ok(bad.problems?.some((p) => p.code === "BUYER_CONTACT_REQUIRED"), JSON.stringify(bad));
    assert.equal(gw.receipts(id).length, 1, "nothing was sent for the refused sale");
    const ok = await engine.submit(req(t, { buyer: { buyerRegisterName: "Example Traders", buyerTIN: "2000999888", buyerContacts: { email: "a@example.com" } } }));
    assert.equal(ok.status, "fiscalised", JSON.stringify(ok));
  });

  it("many tills at once: every number is used once, in order, with no gap", async () => {
    const t = tenant();
    const { engine, id } = await boot({ waitMs: 10_000 });
    const sales = Array.from({ length: 60 }, () => req(t));
    const results = await Promise.all(sales.map((s) => engine.submit(s)));
    assert.ok(results.every((r) => r.status === "fiscalised"), JSON.stringify(results.filter((r) => r.status !== "fiscalised").slice(0, 2)));
    assert.equal(gw.receipts(id).length, 60);
    gapless(id);
    assert.equal(new Set(results.map((r) => r.receiptGlobalNo)).size, 60);
    assert.ok((gw.maxConcurrent.get(id) ?? 0) <= 1, "the gateway never saw two receipts from this device at once");
    assert.ok((await engine.closeDay()).ok);
  });

  it("the same invoice sent again is the same receipt; different content under that number is refused", async () => {
    const t = tenant();
    const { engine, id } = await boot();
    const a = req(t);
    const r1 = await engine.submit(a);
    const r2 = await engine.submit(a);
    assert.equal(r1.receiptGlobalNo, r2.receiptGlobalNo);
    assert.equal(gw.receipts(id).length, 1);
    const r3 = await engine.submit({ ...a, payments: [{ moneyType: "Card", amount: "10.00" }] });
    assert.equal(r3.status, "rejected");
    assert.equal(r3.problems![0]!.code, "INVOICE_NO_REUSED");
    assert.equal(gw.receipts(id).length, 1);
  });

  it("refuses what ZIMRA would flag Red BEFORE using a number", async () => {
    const t = tenant();
    const { engine, id } = await boot();
    const noHs = await engine.submit(req(t, { lines: [{ name: "Bread", unitPrice: "10.00", quantity: 1, taxId: 517, taxPercent: 15.5 }] }));
    assert.equal(noHs.status, "rejected");
    assert.equal(noHs.problems![0]!.code, "HS_CODE_REQUIRED");
    const badTax = await engine.submit(req(t, { lines: [{ name: "Bread", unitPrice: "10.00", quantity: 1, taxId: 999, taxPercent: 15, hsCode: "99001000" }] }));
    assert.equal(badTax.problems![0]!.code, "TAX_UNKNOWN");
    const wrongPct = await engine.submit(req(t, { lines: [{ name: "Bread", unitPrice: "10.00", quantity: 1, taxId: 517, taxPercent: 15, hsCode: "99001000" }] }));
    assert.equal(wrongPct.problems![0]!.code, "TAX_PERCENT_MISMATCH");
    const unpaid = await engine.submit(req(t, { payments: [{ moneyType: "Cash", amount: "9.00" }] }));
    assert.equal(unpaid.problems![0]!.code, "PAYMENT_MISMATCH");
    assert.equal(gw.receipts(id).length, 0, "nothing reached ZIMRA");
    const ok = await engine.submit(req(t));
    assert.equal(ok.receiptCounter, 1, "the refused ones used no number");
    gapless(id);
  });

  it("ZIMRA down: sales are numbered and get a valid QR at once; they arrive in order when it is back", async () => {
    const t = tenant();
    const { engine, id } = await boot({ waitMs: 150 });
    gw.faults.down = true;
    const queued = [];
    for (let i = 0; i < 12; i++) queued.push(await engine.submit(req(t)));
    assert.ok(queued.every((r) => r.status === "queued" && r.qrData && r.verificationCode), "queued but printable");
    assert.equal(gw.receipts(id).length, 0);
    gw.faults.down = false;
    engine.kick();
    assert.ok(await waitFor(async () => (await engine.status()).unsent === 0), "queue drained");
    assert.equal(gw.receipts(id).length, 12);
    gapless(id);
    for (const q of queued) assert.equal((await engine.getReceipt(t, q.invoiceNo))!.qrData, q.qrData, "the QR printed offline is the final one");
    assert.ok((await engine.closeDay()).ok);
  });

  it("lost replies (stored, answer never arrives): no duplicate, no gap", async () => {
    const t = tenant();
    const { engine, id } = await boot({ waitMs: 200 });
    gw.faults.dropRepliesNext = 4;
    const rs = [];
    for (let i = 0; i < 10; i++) rs.push(await engine.submit(req(t)));
    assert.ok(await waitFor(async () => (await engine.status()).unsent === 0), "queue drained");
    assert.equal(gw.receipts(id).length, 10, "exactly one record per sale at the gateway");
    gapless(id);
  });

  it("5xx bursts and slow answers do not lose or reorder anything", async () => {
    const t = tenant();
    const { engine, id } = await boot({ waitMs: 100 });
    gw.faults.serverErrors = 5;
    gw.faults.delayMs = 15;
    gw.faults.jitterMs = 20;
    for (let i = 0; i < 15; i++) await engine.submit(req(t));
    assert.ok(await waitFor(async () => (await engine.status()).unsent === 0, 10_000));
    gw.faults.delayMs = 0;
    gw.faults.jitterMs = 0;
    assert.equal(gw.receipts(id).length, 15);
    gapless(id);
  });

  it("a restart after a crash between 'saved' and 'state advanced' loses no number", async () => {
    const t = tenant();
    gwDownFor(() => undefined);
    const boot1 = await boot({ waitMs: 100 });
    gw.faults.down = true;
    for (let i = 0; i < 3; i++) await boot1.engine.submit(req(t));
    // Crash: the saved day state is one receipt behind the stored receipts.
    const kv = db.collection<{ _id: string; v: string }>("kv");
    const doc = await kv.findOne({ _id: `${boot1.key}:day-state` });
    const parsed = JSON.parse(doc!.v);
    parsed.state.receiptCounter = 2;
    parsed.state.receiptGlobalNo -= 1;
    await kv.updateOne({ _id: `${boot1.key}:day-state` }, { $set: { v: JSON.stringify(parsed) } });
    await boot1.engine.shutdown(); // the old process is gone
    const e2 = await boot1.make(); // a new process
    gw.faults.down = false;
    const r = await e2.submit(req(t));
    assert.equal(r.receiptCounter, 4, `numbering carried on after the three stored receipts: ${JSON.stringify(r)}`);
    assert.ok(await waitFor(async () => (await e2.status()).unsent === 0));
    assert.equal(gw.receipts(boot1.id).length, 4);
    gapless(boot1.id);
  });

  it("a restart while a send was unanswered resends the identical receipt (no duplicate)", async () => {
    const t = tenant();
    const b = await boot({ waitMs: 100 });
    gw.faults.dropRepliesNext = 1;
    await b.engine.submit(req(t));
    assert.equal(gw.receipts(b.id).length, 1, "stored at the gateway, answer lost");
    await b.engine.shutdown();
    const e2 = await b.make();
    e2.kick();
    assert.ok(await waitFor(async () => (await e2.status()).unsent === 0));
    assert.equal(gw.receipts(b.id).length, 1);
    assert.equal((await e2.status()).accepted, 1);
  });

  it("a receipt ZIMRA refuses outright is dropped and the unsent ones behind it are renumbered (no Gray)", async () => {
    const t = tenant();
    const b = await boot({ waitMs: 100 });
    gw.faults.down = true;
    const a = req(t), bad = req(t), c = req(t), d = req(t);
    for (const r of [a, bad, c, d]) await b.engine.submit(r);
    gw.faults.rejectInvoiceNos.add(bad.invoiceNo);
    gw.faults.down = false;
    b.engine.kick();
    assert.ok(await waitFor(async () => (await b.engine.status()).unsent === 0));
    if (process.env.DEBUG_ENGINE) console.log(JSON.stringify((await db.collection("receipts").find({ deviceKey: b.key }).sort({ seq: 1 }).toArray()).map((r) => [r.invoiceNo, r.status, r.receiptCounter, r.prepared?.receipt.receiptCounter, r.problems?.[0]?.code, r.lastError])), JSON.stringify(gw.receipts(b.id).map((x) => [x.receipt.invoiceNo, x.receipt.receiptCounter, x.validationErrors.map((e) => e.validationErrorCode)])));
    assert.equal((await b.engine.getReceipt(t, bad.invoiceNo))!.status, "rejected");
    assert.equal(gw.receipts(b.id).length, 3);
    gapless(b.id);
    const cr = await b.engine.getReceipt(t, c.invoiceNo);
    assert.equal(cr!.receiptCounter, 2, "renumbered into the gap");
    assert.equal(cr!.status, "fiscalised");
    gw.faults.rejectInvoiceNos.clear();
  });

  it("flags a Red receipt, raises an alert, refuses to close, and can pause the device", async () => {
    const t = tenant();
    const b = await boot({ onRed: "pause" });
    const before = alerts.length;
    gw.faults.flagNext.push({ code: "RCPT099", colour: "Red" });
    const r = await b.engine.submit(req(t));
    assert.equal(r.colour, "red");
    assert.ok(alerts.slice(before).some((a) => a.kind === "RED_RECEIPT"));
    const next = await b.engine.submit(req(t));
    assert.equal(next.problems![0]!.code, "DEVICE_PAUSED");
    const closeCalls = () => gw.devices.get(b.id)!.requests.filter((x) => x.endpoint === "CloseDay").length;
    const c = await b.engine.closeDay();
    assert.ok(!c.ok && c.reason === "RED_RECEIPTS" && c.permanent);
    await b.engine.resume();
    const c2 = await b.engine.closeDay();
    assert.ok(!c2.ok && c2.reason === "RED_RECEIPTS" && c2.permanent);
    assert.equal(closeCalls(), 0, "the close was never sent");
  });

  it("onRed 'continue' keeps selling after a Red receipt but still will not close", async () => {
    const t = tenant();
    const b = await boot({ onRed: "continue" });
    gw.faults.flagNext.push({ code: "RCPT099", colour: "Red" });
    await b.engine.submit(req(t));
    const r = await b.engine.submit(req(t));
    assert.equal(r.status, "fiscalised");
    const c = await b.engine.closeDay();
    assert.ok(!c.ok && c.reason === "RED_RECEIPTS");
  });

  it("a Gray receipt (broken chain) stops sending at once", async () => {
    const t = tenant();
    const b = await boot();
    gw.faults.flagNext.push({ code: "RCPT011", colour: "Gray" });
    await b.engine.submit(req(t));
    assert.match((await b.engine.status()).paused ?? "", /broke the receipt chain/);
  });

  it("does not close while receipts are undelivered", async () => {
    const t = tenant();
    const b = await boot({ waitMs: 100, drainTimeoutMs: 400 });
    gw.faults.down = true;
    await b.engine.submit(req(t));
    gw.faults.down = false;
    gw.faults.downDevices.add(b.id);
    const c = await b.engine.closeDay();
    gw.faults.downDevices.delete(b.id);
    assert.ok(!c.ok && c.reason === "UNSENT", JSON.stringify(c));
    assert.equal(gw.devices.get(b.id)!.requests.filter((x) => x.endpoint === "CloseDay").length, 0);
    b.engine.kick();
    assert.ok(await waitFor(async () => (await b.engine.status()).unsent === 0));
    assert.ok((await b.engine.closeDay()).ok, "closes once everything has arrived");
  });

  it("tells new receipts the day is closing, and queues none behind the close", async () => {
    const t = tenant();
    const b = await boot();
    await b.engine.submit(req(t));
    gw.faults.closeDelayMs = 400;
    const closing = b.engine.closeDay();
    await sleep(60);
    const late = await b.engine.submit(req(t));
    assert.equal(late.problems![0]!.code, "DAY_CLOSING");
    assert.ok((await closing).ok);
    gw.faults.closeDelayMs = 20;
  });

  for (const code of ["CountersMismatch", "BadCertificateSignature", "MissingReceipts"] as const) {
    it(`recovers from a one-off ${code} and closes on the retry`, async () => {
      const t = tenant();
      const b = await boot();
      for (let i = 0; i < 3; i++) await b.engine.submit(req(t));
      gw.faults.forceCloseFailure = code;
      const c = await b.engine.closeDay();
      assert.ok(c.ok, JSON.stringify(c));
      if (c.ok) assert.equal(c.attempts, 2);
      assert.equal(gw.devices.get(b.id)!.status, "FiscalDayClosed");
    });
  }

  it("gives up on a close that keeps failing, with the reason, after a bounded number of tries", async () => {
    const t = tenant();
    const b = await boot({ maxCloseAttempts: 3 });
    await b.engine.submit(req(t));
    gw.faults.forceCloseFailure = "CountersMismatch";
    gw.faults.forceCloseFailureTimes = 99;
    const before = alerts.length;
    const c = await b.engine.closeDay();
    gw.faults.forceCloseFailure = undefined;
    gw.faults.forceCloseFailureTimes = 1;
    assert.ok(!c.ok && c.reason === "CLOSE_FAILED" && c.errorCode === "CountersMismatch" && !c.permanent);
    assert.equal(gw.devices.get(b.id)!.requests.filter((x) => x.endpoint === "CloseDay").length, 3);
    assert.ok(alerts.slice(before).some((a) => a.kind === "CLOSE_FAILED"));
    // and a later attempt still works once the cause is gone
    const again = await b.engine.closeDay();
    assert.ok(again.ok, JSON.stringify(again));
  });

  it("credit notes: need a delivered original on this device, the same currency, and cannot over-credit", async () => {
    const t = tenant();
    const b = await boot({ waitMs: 150 });
    const inv = req(t);
    gw.faults.down = true;
    await b.engine.submit(inv);
    const early = await b.engine.submit(req(t, { receiptType: "CreditNote", notes: "return", original: { invoiceNo: inv.invoiceNo }, lines: [{ name: "Bread", unitPrice: "-4.00", quantity: 1, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }], payments: [{ moneyType: "Cash", amount: "-4.00" }] }));
    assert.equal(early.problems![0]!.code, "ORIGINAL_NOT_DELIVERED");
    gw.faults.down = false;
    b.engine.kick();
    assert.ok(await waitFor(async () => (await b.engine.status()).unsent === 0));
    const note = (price: string, over: Partial<SubmitRequest> = {}) =>
      req(t, { receiptType: "CreditNote", notes: "return", original: { invoiceNo: inv.invoiceNo }, lines: [{ name: "Bread", unitPrice: price, quantity: 1, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }], payments: [{ moneyType: "Cash", amount: price }], ...over });
    const ok = await b.engine.submit(note("-4.00"));
    assert.equal(ok.status, "fiscalised", JSON.stringify(ok));
    assert.equal(ok.colour, "none");
    const over = await b.engine.submit(note("-7.00"));
    assert.equal(over.problems![0]!.code, "OVER_CREDIT");
    const wrongCur = await b.engine.submit(note("-1.00", { currency: "ZWG" }));
    assert.equal(wrongCur.problems![0]!.code, "CURRENCY_MISMATCH");
    const stranger = await b.engine.submit(note("-1.00", { original: { invoiceNo: "NOPE" } }));
    assert.equal(stranger.problems![0]!.code, "ORIGINAL_NOT_FOUND");
    const positive = await b.engine.submit(note("4.00"));
    assert.equal(positive.problems![0]!.code, "CREDIT_LINE_SIGN");
    gapless(b.id);
    assert.ok((await b.engine.closeDay()).ok);
  });

  it("USD and ZWG on the same day both close", async () => {
    const t = tenant();
    const b = await boot();
    await b.engine.submit(req(t));
    await b.engine.submit(req(t, { currency: "ZWG" }, "265.50"));
    const c = await b.engine.closeDay();
    assert.ok(c.ok, JSON.stringify(c));
    if (c.ok) assert.deepEqual(Object.keys(c.totals).sort(), ["USD", "ZWG"]);
  });

  it("refuses sales when no day is open, and opens one itself only when allowed to", async () => {
    const t = tenant();
    const b = await boot({}, false);
    const r = await b.engine.submit(req(t));
    assert.equal(r.problems![0]!.code, "DAY_NOT_OPEN");
    const auto = await boot({ autoOpenDay: true }, false);
    const ok = await auto.engine.submit(req(t));
    assert.equal(ok.status, "fiscalised", JSON.stringify(ok));
    gapless(auto.id);
  });

  it("will not adopt a fiscal day it did not open (unknown counters), and says so", async () => {
    const id = ++nextId;
    const bundle = makeDeviceBundle(id);
    const dev = gw.addDevice(id, bundle.serialNumber, bundle.certificatePem);
    dev.status = "FiscalDayOpened";
    dev.days.push({ fiscalDayNo: 7, openedServer: "2026-01-01T08:00:00", receipts: [], counters: [] });
    const before = alerts.length;
    const e = new DeviceEngine({ db, deviceKey: `dev-${id}`, identity: { deviceId: id, serialNumber: bundle.serialNumber, privateKeyPem: bundle.privateKeyPem }, transport: new FetchTransport(), baseUrl: gw.url, options: fast, alert: (a) => alerts.push(a) });
    await e.init();
    await assert.rejects(() => e.openDay(), /cannot be used safely/);
    assert.ok(alerts.slice(before).some((a) => a.kind === "DAY_STATE_UNKNOWN"));
  });

  it("pauses when ZIMRA rejects the certificate, alerts, and resumes once fixed", async () => {
    const t = tenant();
    const b = await boot({ waitMs: 150 });
    gw.faults.unauthorisedDevices.add(b.id);
    const before = alerts.length;
    const r = await b.engine.submit(req(t));
    assert.equal(r.status, "queued");
    assert.ok(await waitFor(async () => !!(await b.engine.status()).paused));
    assert.ok(alerts.slice(before).some((a) => a.kind === "CERT_REJECTED"));
    gw.faults.unauthorisedDevices.delete(b.id);
    await b.engine.resume();
    assert.ok(await waitFor(async () => (await b.engine.status()).unsent === 0));
    gapless(b.id);
  });

  it("only one engine may own a device: a second instance is refused, and can take over after a clean shutdown", async () => {
    const t = tenant();
    const a = await boot({ waitMs: 500 });
    await assert.rejects(() => a.make(), /Another instance is already running/);
    const r = await a.engine.submit(req(t));
    assert.equal(r.status, "fiscalised", "the first instance is unaffected");
    await a.engine.shutdown();
    const second = await a.make();
    const r2 = await second.submit(req(t));
    assert.equal(r2.receiptCounter, 2, "the second instance carries on from the first one's numbers");
    gapless(a.id);
  });

  it("a stopped instance's lease expires and another takes over; the stale one stops writing", async () => {
    const t = tenant();
    const a = await boot({ waitMs: 300, leaseMs: 200 });
    await a.engine.submit(req(t));
    // Simulate a hung process: it stops renewing, then the lease runs out.
    await a.engine.shutdown();
    await db.collection<{ _id: string; owner: string; expiresAt: Date }>("leases").updateOne({ _id: a.key }, { $set: { owner: "someone-else", expiresAt: new Date(Date.now() + 60_000) } });
    const refused = await a.engine.submit(req(t));
    assert.equal(refused.problems![0]!.code, "NOT_LEADER");
    await db.collection<{ _id: string; owner: string; expiresAt: Date }>("leases").updateOne({ _id: a.key }, { $set: { expiresAt: new Date(0) } });
    const b = await a.make();
    const ok = await b.submit(req(t));
    assert.equal(ok.receiptCounter, 2);
    gapless(a.id);
  });

  it("numbers no faster than ZIMRA's one-second date resolution allows: dates never run far ahead of the clock", async () => {
    const t = tenant();
    const b = await boot({ waitMs: 100, maxDateDriftMs: 2_000, busyWaitMs: 300 });
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await b.engine.submit(req(t)));
    const numbered = results.filter((r) => r.receiptGlobalNo !== undefined);
    const busy = results.filter((r) => r.problems?.[0]?.code === "DEVICE_BUSY");
    assert.ok(numbered.length >= 3, `numbered ${numbered.length}`);
    assert.ok(busy.length >= 1, `some sales were told the device is busy: ${busy.length}`);
    assert.ok(await waitFor(async () => (await b.engine.status()).unsent === 0));
    const dates = gw.receipts(b.id).map((x) => x.receipt.receiptDate);
    assert.ok(dates.every((d, i) => i === 0 || d > dates[i - 1]!), "strictly increasing");
    const ahead = Date.parse(dates[dates.length - 1]!.replace("T", " ") + " GMT+0200") - Date.now();
    assert.ok(ahead < 4_000, `last receipt only ${ahead} ms ahead`);
    gapless(b.id);
    assert.ok((await b.engine.closeDay()).ok);
  });

  it("two devices work side by side without affecting each other", async () => {
    const t = tenant();
    const a = await boot({ waitMs: 150 });
    const b = await boot({ waitMs: 150 });
    gw.faults.downDevices.add(a.id);
    const ra = await a.engine.submit(req(t));
    const rb = await b.engine.submit(req(t));
    assert.equal(ra.status, "queued");
    assert.equal(rb.status, "fiscalised", "device B is not held up by device A being down");
    gw.faults.downDevices.delete(a.id);
    a.engine.kick();
    assert.ok(await waitFor(async () => (await a.engine.status()).unsent === 0));
    gapless(a.id);
    gapless(b.id);
  });
});

function gwDownFor(_f: () => void): void {
  /* placeholder keeping the crash test readable: the gateway is switched explicitly in the test body */
}
