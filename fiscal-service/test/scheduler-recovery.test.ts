import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { MongoClient, type Db } from "mongodb";

import { FetchTransport } from "../src/core/fetch-transport.js";
import { DeviceRegistry, type DeviceSchedule, type GatewayVerifier } from "../src/devices/registry.js";
import { EngineManager } from "../src/engine/manager.js";
import { closeOwed, Scheduler } from "../src/engine/scheduler.js";
import { SecretBox } from "../src/security/secret-box.js";
import { createApp } from "../src/server.js";
import { FakeGateway } from "../src/testing/fake-gateway.js";
import { makeDeviceBundle, opensslAvailable } from "../src/testing/make-cert.js";

const TZ = "Africa/Harare"; // UTC+2 all year
const sched = (over: Partial<DeviceSchedule> = {}): DeviceSchedule => ({
  enabled: true,
  openTime: "08:00",
  closeTime: "23:00",
  timezone: TZ,
  weekdays: [],
  ...over,
});
const at = (iso: string) => new Date(iso);

describe("closeOwed: when is a scheduled close owed", () => {
  it("is not owed before the close time once yesterday's close is recorded", () => {
    assert.equal(closeOwed(at("2026-11-10T18:00:00Z"), sched({ lastCloseDate: "2026-11-09" }), at("2026-11-10T06:00:00Z").getTime()), null);
  });

  it("is owed at the close time", () => {
    const r = closeOwed(at("2026-11-10T21:00:00Z"), sched({ lastCloseDate: "2026-11-09" }), at("2026-11-10T06:00:00Z").getTime());
    assert.deepEqual(r, { dueDate: "2026-11-10" });
  });

  it("stays owed after midnight until it is recorded (a 23:00 close missed during an outage)", () => {
    // 01:30 on the 11th in Harare; the day was opened at 08:00 on the 10th
    const r = closeOwed(at("2026-11-10T23:30:00Z"), sched({ lastCloseDate: "2026-11-09" }), at("2026-11-10T06:00:00Z").getTime());
    assert.deepEqual(r, { dueDate: "2026-11-10" });
  });

  it("is not owed once recorded for that day", () => {
    assert.equal(closeOwed(at("2026-11-10T23:30:00Z"), sched({ lastCloseDate: "2026-11-10" }), at("2026-11-10T06:00:00Z").getTime()), null);
  });

  it("never closes a day that was opened after the owed close time", () => {
    // 10:00 on the 11th; yesterday's 23:00 close was never recorded (closed on the portal), and this morning's day opened at 07:00
    assert.equal(closeOwed(at("2026-11-11T08:00:00Z"), sched({ lastCloseDate: "2026-11-09" }), at("2026-11-11T05:00:00Z").getTime()), null);
  });

  it("does not guess when it does not know when the day opened, if the owed close is from before midnight", () => {
    assert.equal(closeOwed(at("2026-11-11T08:00:00Z"), sched({ lastCloseDate: "2026-11-09" })), null);
    // but after today's close time it still closes, as before
    assert.deepEqual(closeOwed(at("2026-11-10T21:30:00Z"), sched({ lastCloseDate: "2026-11-09" })), { dueDate: "2026-11-10" });
  });

  it("ignores an open time that is in the future and falls back to the plain rule", () => {
    assert.deepEqual(closeOwed(at("2026-11-10T21:30:00Z"), sched({ lastCloseDate: "2026-11-09" }), at("2026-11-11T05:00:00Z").getTime()), { dueDate: "2026-11-10" });
  });

  it("uses the weekday of the day that is owed, not today's", () => {
    const weekdays = [1, 2, 3, 4, 5];
    // Saturday 10:00; Friday's close is owed and Friday is a close day
    const sat = closeOwed(at("2026-11-14T08:00:00Z"), sched({ weekdays, closeTime: "17:00", lastCloseDate: "2026-11-12" }), at("2026-11-12T06:00:00Z").getTime());
    assert.deepEqual(sat, { dueDate: "2026-11-13" });
    // Sunday 10:00; Saturday's close is owed but Saturday is not a close day
    assert.equal(closeOwed(at("2026-11-15T08:00:00Z"), sched({ weekdays, closeTime: "17:00", lastCloseDate: "2026-11-13" }), at("2026-11-13T06:00:00Z").getTime()), null);
  });
});

const have = opensslAvailable();
const TOKEN = "recovery-test-token-0123456789";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("scheduler recovery over real engines", { skip: !have }, () => {
  const gw = new FakeGateway();
  let client: MongoClient;
  let db: Db;
  let registry: DeviceRegistry;
  let manager: EngineManager;
  let base = "";
  let stopServer: () => Promise<void>;
  let id = 7500;

  const verifier: GatewayVerifier = async () => ({ taxPayerName: "FAKE", fetchedAt: new Date() });
  const api = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as { success: boolean; data?: any; message?: string } | null };
  };

  before(async () => {
    await gw.start();
    gw.faults.closeDelayMs = 20;
    client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 3000 }).connect();
    db = client.db(`fiscal_scheduler_recovery_${randomBytes(4).toString("hex")}`);
    registry = new DeviceRegistry(db, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), verifier);
    await registry.init();
    manager = new EngineManager({
      db,
      registry,
      baseUrl: gw.url,
      transportFor: () => new FetchTransport(),
      options: { waitMs: 1500, retryBaseMs: 30, retryMaxMs: 200, openGapMs: 1100, drainTimeoutMs: 1500, closePollMs: 20, closePollTimeoutMs: 3000 },
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
  const sale = (invoiceNo: string) => ({
    invoiceNo,
    currency: "USD",
    lines: [{ name: "Bread", unitPrice: "10.00", quantity: 1, taxId: 517, taxPercent: 15.5, hsCode: "99001000" }],
    payments: [{ moneyType: "Cash", amount: "10.00" }],
  });

  it("after a three day outage: the stale day is closed, a new one opens at once, the waiting receipt is delivered and selling resumes", async () => {
    const d = await addDevice("Outage");
    // Open all day so only the stale-day rule (not the time of day) decides what happens.
    assert.equal((await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "00:00", closeTime: "23:59", timezone: TZ, weekdays: [] })).status, 200);

    const start = Date.now();
    let offsetMs = 0;
    const scheduler = new Scheduler({ registry, manager, now: () => new Date(start + offsetMs), retryEveryMs: 10, recoverAfterHrs: 23 });
    const mine = async () => (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId && e.step !== "warn");

    let ev = await mine();
    assert.ok(ev[0]?.ok && ev[0].step === "open", JSON.stringify(ev));
    await sleep(1200);
    assert.equal((await api("POST", `/v1/devices/${d.key}/receipts`, sale("OUT-1"))).json!.data.status, "fiscalised");

    // ZIMRA goes down. A sale is still taken and waits.
    gw.faults.downDevices.add(d.deviceId);
    assert.equal((await api("POST", `/v1/devices/${d.key}/receipts`, sale("OUT-2"))).json!.data.status, "queued");

    // Three days pass. The close cannot succeed with a receipt undelivered, and nothing new opens on top of the old day.
    offsetMs = 72 * 3_600_000;
    ev = await mine();
    assert.ok(ev.length >= 1 && ev.every((e) => !e.ok), JSON.stringify(ev));
    assert.equal(gw.devices.get(d.deviceId)!.days.length, 1, "still the one old day");

    // ZIMRA recovers. The waiting receipt is delivered, the old day is closed and a fresh one is opened, in one pass.
    gw.faults.downDevices.delete(d.deviceId);
    for (let i = 0; i < 100; i++) {
      if ((await api("GET", `/v1/devices/${d.key}/engine`)).json!.data.unsent === 0) break;
      await sleep(50);
    }
    await sleep(20);
    ev = await mine();
    assert.ok(ev.some((e) => e.ok && /Closed/.test(e.message)), `a close: ${JSON.stringify(ev)}`);
    assert.ok(ev.some((e) => e.ok && e.step === "recover" && /Opened fiscal day/.test(e.message)), `a new day: ${JSON.stringify(ev)}`);
    assert.equal(gw.devices.get(d.deviceId)!.days.length, 2, "a second fiscal day");
    assert.equal(gw.devices.get(d.deviceId)!.status, "FiscalDayOpened");

    // Selling carries on in the new day.
    await sleep(1200);
    assert.equal((await api("POST", `/v1/devices/${d.key}/receipts`, sale("OUT-3"))).json!.data.status, "fiscalised");
    assert.equal(gw.receipts(d.deviceId).length, 3, "all three receipts are at ZIMRA");
  });

  it("a day that is not stale and not owed is left alone", async () => {
    const d = await addDevice("Quiet");
    await api("PUT", `/v1/devices/${d.key}/schedule`, { enabled: true, openTime: "00:00", closeTime: "23:59", timezone: TZ, weekdays: [] });
    const scheduler = new Scheduler({ registry, manager, retryEveryMs: 10 });
    const mine = async () => (await scheduler.tick()).filter((e) => e.deviceId === d.deviceId && e.step !== "warn");
    assert.ok((await mine())[0]?.ok);
    await sleep(30);
    assert.deepEqual(await mine(), [], "nothing to do");
    assert.equal(gw.devices.get(d.deviceId)!.days.length, 1);
  });
});
