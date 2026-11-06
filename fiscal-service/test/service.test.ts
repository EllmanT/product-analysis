import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { MongoClient, type Db } from "mongodb";

import { FetchTransport } from "../src/core/fetch-transport.js";
import { DeviceRegistry, type GatewayVerifier } from "../src/devices/registry.js";
import { EngineManager } from "../src/engine/manager.js";
import { Scheduler } from "../src/engine/scheduler.js";
import { SecretBox } from "../src/security/secret-box.js";
import { createApp } from "../src/server.js";
import { FakeGateway } from "../src/testing/fake-gateway.js";
import { makeDeviceBundle, opensslAvailable } from "../src/testing/make-cert.js";

const have = opensslAvailable();
const TOKEN = "service-test-token-0123456789";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("service: HTTP API and scheduler over real engines", { skip: !have }, () => {
  const gw = new FakeGateway();
  let client: MongoClient;
  let db: Db;
  let registry: DeviceRegistry;
  let manager: EngineManager;
  let base = "";
  let stopServer: () => Promise<void>;
  let id = 7000;

  const verifier: GatewayVerifier = async () => ({ taxPayerName: "FAKE", fetchedAt: new Date() });
  const api = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as { success: boolean; data?: any; message?: string } | null };
  };

  before(async () => {
    await gw.start();
    gw.faults.closeDelayMs = 20;
    client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 3000 }).connect();
    db = client.db(`fiscal_service_e2e_${randomBytes(4).toString("hex")}`);
    registry = new DeviceRegistry(db, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), verifier);
    await registry.init();
    manager = new EngineManager({
      db,
      registry,
      baseUrl: gw.url,
      transportFor: () => new FetchTransport(),
      options: { waitMs: 1500, retryBaseMs: 30, retryMaxMs: 200, openGapMs: 1100, drainTimeoutMs: 2000, closePollMs: 20, closePollTimeoutMs: 3000 },
      backgroundMs: 50,
    });
    const server = createApp({ registry, manager, token: TOKEN });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    stopServer = async () => {
      await manager.shutdown();
      await new Promise<void>((r) => server.close(() => r()));
    };
  });
  after(async () => {
    await stopServer?.();
    await gw.stop();
    await db?.dropDatabase();
    await client?.close();
  });

  async function addDevice(name: string) {
    const b = makeDeviceBundle(++id);
    gw.addDevice(b.deviceId, b.serialNumber, b.certificatePem);
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name, certificatePem: b.certificatePem, privateKeyPem: b.privateKeyPem });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return { key: r.json!.data.id as string, deviceId: b.deviceId };
  }
  const sale = (invoiceNo: string, over: Record<string, unknown> = {}) => ({
    invoiceNo,
    currency: "USD",
    lines: [{ name: "Bread", unitPrice: "10.00", quantity: 1, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }],
    payments: [{ moneyType: "Cash", amount: "10.00" }],
    ...over,
  });

  it("a day through the API: open, sell, look up, refuse the invalid, close", async () => {
    const d = await addDevice("Harare");
    assert.equal((await api("POST", `/v1/devices/${d.key}/day/open`)).status, 200);

    const ok = await api("POST", `/v1/devices/${d.key}/receipts`, sale("API-1"));
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json!.data.status, "fiscalised");
    assert.match(ok.json!.data.qrData, /^https:\/\//);

    const again = await api("POST", `/v1/devices/${d.key}/receipts`, sale("API-1"));
    assert.equal(again.json!.data.receiptGlobalNo, ok.json!.data.receiptGlobalNo, "the same invoice is the same receipt");

    const look = await api("GET", `/v1/devices/${d.key}/receipts/API-1`);
    assert.equal(look.json!.data.status, "fiscalised");
    assert.equal((await api("GET", `/v1/devices/${d.key}/receipts/NOPE`)).status, 404);

    const bad = await api("POST", `/v1/devices/${d.key}/receipts`, sale("API-2", { lines: [{ name: "Bread", unitPrice: "10.00", quantity: 1, taxId: 517, taxPercent: 15.5 }] }));
    assert.equal(bad.status, 422);
    assert.equal(bad.json!.data.problems[0].code, "HS_CODE_REQUIRED");

    const eng = await api("GET", `/v1/devices/${d.key}/engine`);
    assert.equal(eng.json!.data.accepted, 1);
    assert.equal(eng.json!.data.dayOpen, true);

    const closed = await api("POST", `/v1/devices/${d.key}/day/close`);
    assert.equal(closed.status, 200, JSON.stringify(closed.json));
    assert.equal(closed.json!.data.totals.USD.count, 1);
    assert.equal(gw.devices.get(d.deviceId)!.status, "FiscalDayClosed");
  });

  it("the engine routes need the token", async () => {
    const d = await addDevice("Secured");
    const r = await fetch(`${base}/v1/devices/${d.key}/receipts`, { method: "POST", body: "{}" });
    assert.equal(r.status, 401);
  });

  it("two devices sell side by side through the same API", async () => {
    const a = await addDevice("Branch A");
    const b = await addDevice("Branch B");
    await api("POST", `/v1/devices/${a.key}/day/open`);
    await api("POST", `/v1/devices/${b.key}/day/open`);
    await sleep(1200);
    gw.faults.downDevices.add(a.deviceId);
    const [ra, rb] = await Promise.all([api("POST", `/v1/devices/${a.key}/receipts`, sale("A-1")), api("POST", `/v1/devices/${b.key}/receipts`, sale("B-1"))]);
    assert.equal(ra.json!.data.status, "queued", "A is down but still gives a printable receipt");
    assert.equal(rb.json!.data.status, "fiscalised", "B is not held up");
    gw.faults.downDevices.delete(a.deviceId);
    for (let i = 0; i < 100; i++) {
      if ((await api("GET", `/v1/devices/${a.key}/engine`)).json!.data.unsent === 0) break;
      await sleep(50);
    }
    assert.equal(gw.receipts(a.deviceId).length, 1);
    assert.equal(gw.receipts(b.deviceId).length, 1);
    // A's receipt carries A's device id and B's carries B's: nothing crosses over.
    assert.equal((await api("GET", `/v1/devices/${a.key}/receipts/A-1`)).json!.data.deviceId, a.deviceId);
    assert.equal((await api("GET", `/v1/devices/${b.key}/receipts/B-1`)).json!.data.deviceId, b.deviceId);
  });

  describe("scheduler", () => {
    it("opens at the open time, once, and closes at the close time, then does the same the next day", async () => {
      const d = await addDevice("Scheduled");
      const sch = await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "08:00", closeTime: "17:00", timezone: "Africa/Harare", weekdays: [] });
      assert.equal(sch.status, 200, JSON.stringify(sch.json));

      let now = new Date("2026-10-26T05:59:00Z"); // 07:59 in Harare
      const scheduler = new Scheduler({ registry, manager, now: () => now, retryEveryMs: 10 });
      let ev = await scheduler.tick();
      assert.deepEqual(ev.filter((e) => e.deviceId === d.deviceId), [], "nothing before the open time");

      now = new Date("2026-10-26T06:00:30Z"); // 08:00
      ev = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId);
      assert.equal(ev.length, 1);
      assert.ok(ev[0]!.ok && ev[0]!.step === "open", JSON.stringify(ev));
      assert.equal(gw.devices.get(d.deviceId)!.status, "FiscalDayOpened");

      await sleep(1200);
      assert.equal((await api("POST", `/v1/devices/${d.key}/receipts`, sale("S-1"))).json!.data.status, "fiscalised");

      now = new Date("2026-10-26T06:10:00Z");
      assert.deepEqual((await scheduler.tick()).filter((e) => e.deviceId === d.deviceId), [], "not opened twice");

      now = new Date("2026-10-26T15:00:30Z"); // 17:00
      ev = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId);
      assert.ok(ev[0]!.ok && String(ev[0]!.step) === "close", JSON.stringify(ev));
      assert.equal(gw.devices.get(d.deviceId)!.status, "FiscalDayClosed");
      await sleep(15);
      assert.deepEqual((await scheduler.tick()).filter((e) => e.deviceId === d.deviceId), [], "not closed twice");

      now = new Date("2026-10-27T06:00:30Z"); // next morning
      ev = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId);
      assert.ok(ev[0]!.ok && ev[0]!.step === "open");
      assert.equal(gw.devices.get(d.deviceId)!.days.length, 2, "a second fiscal day");
    });

    it("a close that cannot finish is retried later, not every tick, and succeeds once the cause is gone", async () => {
      const d = await addDevice("Retrying");
      await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "08:00", closeTime: "17:00", timezone: "Africa/Harare", weekdays: [] });
      let now = new Date("2026-10-26T06:00:30Z");
      let clock = Date.now();
      const scheduler = new Scheduler({ registry, manager, now: () => new Date(now.getTime() + (Date.now() - clock)), retryEveryMs: 3000 });
      await scheduler.tick();
      await sleep(1200);
      gw.faults.down = true;
      await api("POST", `/v1/devices/${d.key}/receipts`, sale("R-1")); // queued: ZIMRA is unreachable

      now = new Date("2026-10-26T15:00:30Z");
      clock = Date.now();
      let ev = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId && e.step !== "warn");
      assert.ok(ev.length === 1 && !ev[0]!.ok && /UNSENT/.test(ev[0]!.message), JSON.stringify(ev));
      const closeCalls = () => gw.devices.get(d.deviceId)!.requests.filter((x) => x.endpoint === "CloseDay").length;
      assert.equal(closeCalls(), 0, "never asked ZIMRA to close with a receipt undelivered");
      assert.deepEqual((await scheduler.tick()).filter((e) => e.deviceId === d.deviceId && e.step !== "warn"), [], "too soon to try again");

      gw.faults.down = false;
      await sleep(1300);
      ev = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId && e.step !== "warn");
      assert.ok(ev[0]?.ok && ev[0].step === "close", JSON.stringify(ev));
      assert.equal(gw.devices.get(d.deviceId)!.status, "FiscalDayClosed");
    });

    it("a close blocked by a Red receipt is not retried at all", async () => {
      const d = await addDevice("Blocked");
      await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "08:00", closeTime: "17:00", timezone: "Africa/Harare", weekdays: [] });
      let now = new Date("2026-10-26T06:00:30Z");
      const scheduler = new Scheduler({ registry, manager, now: () => now, retryEveryMs: 1 });
      const opened = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId);
      assert.ok(opened[0]?.ok, JSON.stringify(opened));
      await sleep(1200);
      gw.faults.flagNext.push({ code: "RCPT099", colour: "Red" });
      await api("POST", `/v1/devices/${d.key}/receipts`, sale("X-1"));
      now = new Date("2026-10-26T15:00:30Z");
      const first = (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId);
      assert.ok(!first[0]!.ok && /will not be retried/.test(first[0]!.message), JSON.stringify(first));
      await sleep(10);
      assert.deepEqual((await scheduler.tick()).filter((e) => e.deviceId === d.deviceId), []);
      assert.equal(gw.devices.get(d.deviceId)!.requests.filter((x) => x.endpoint === "CloseDay").length, 0);
    });

    it("respects weekdays and a switched-off schedule", async () => {
      const d = await addDevice("Weekdays");
      await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "08:00", closeTime: "17:00", timezone: "Africa/Harare", weekdays: [1, 2, 3, 4, 5] });
      const sunday = new Date("2026-10-25T06:00:30Z");
      const scheduler = new Scheduler({ registry, manager, now: () => sunday, retryEveryMs: 1 });
      assert.deepEqual((await scheduler.tick()).filter((e) => e.deviceId === d.deviceId), []);
      await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: false, openTime: "08:00", closeTime: "17:00", timezone: "Africa/Harare", weekdays: [] });
      const monday = new Date("2026-10-26T06:00:30Z");
      const s2 = new Scheduler({ registry, manager, now: () => monday, retryEveryMs: 1 });
      assert.deepEqual((await s2.tick()).filter((e) => e.deviceId === d.deviceId), []);
    });

    it("rejects an invalid schedule", async () => {
      const d = await addDevice("Invalid");
      assert.equal((await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "8am", closeTime: "17:00", timezone: "Africa/Harare" })).status, 400);
      assert.equal((await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "08:00", closeTime: "17:00", timezone: "Mars/Olympus" })).status, 400);
    });
  });
});
