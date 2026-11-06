import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { MongoClient, type Db } from "mongodb";

import { AlertStore } from "../src/engine/alerts.js";
import { createApp } from "../src/server.js";
import type { DeviceRegistry } from "../src/devices/registry.js";

const TOKEN = "alerts-test-token-0123456789";

describe("alerts: durable, de-duplicated per device + kind + day, acknowledgeable over HTTP", () => {
  let client: MongoClient;
  let db: Db;
  let store: AlertStore;
  let base = "";
  let stop: () => Promise<void>;
  const api = async (method: string, path: string, body?: unknown, token = TOKEN) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as { success: boolean; data?: any } | null };
  };

  before(async () => {
    client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 3000 }).connect();
    db = client.db(`fiscal_alerts_${randomBytes(4).toString("hex")}`);
    store = new AlertStore(db);
    await store.init();
    const server = createApp({ registry: {} as DeviceRegistry, alerts: store, token: TOKEN }).listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    stop = () => new Promise((r) => server.close(() => r()));
  });
  after(async () => {
    await stop?.();
    await db?.dropDatabase();
    await client?.close();
  });

  it("repeats on the same day become one record with a counter; a new day or kind is a new record", async () => {
    const t = new Date("2026-11-05T08:00:00Z");
    for (let i = 0; i < 3; i++) await store.record({ deviceKey: "d1", kind: "close-failed", message: `try ${i}`, at: new Date(t.getTime() + i * 1000) });
    await store.record({ deviceKey: "d1", kind: "red-receipt", message: "red", at: t });
    await store.record({ deviceKey: "d1", kind: "close-failed", message: "next day", at: new Date("2026-11-06T08:00:00Z") });
    const all = await store.list();
    assert.equal(all.length, 3);
    const day1 = all.find((a) => a.kind === "close-failed" && a.day === "2026-11-05")!;
    assert.equal(day1.count, 3);
    assert.equal(day1.message, "try 2");
    assert.equal(day1.firstAt.getTime(), t.getTime());
  });

  it("is listed over HTTP, needs the token, and can be acknowledged once", async () => {
    assert.equal((await api("GET", "/v1/alerts", undefined, "wrong-token-wrong-token")).status, 401);
    const open = await api("GET", "/v1/alerts?unacknowledged=1");
    assert.equal(open.status, 200);
    assert.equal(open.json!.data.length, 3);
    const id = open.json!.data[0].id;
    assert.equal((await api("POST", `/v1/alerts/${id}/ack`, { by: "admin@example.com" })).status, 200);
    assert.equal((await api("POST", `/v1/alerts/${id}/ack`, {})).status, 404); // already acknowledged
    assert.equal((await api("GET", "/v1/alerts?unacknowledged=1")).json!.data.length, 2);
    assert.equal((await api("GET", "/v1/alerts")).json!.data.length, 3);
  });

  it("an alert that comes back after being acknowledged stays acknowledged for that day but still counts", async () => {
    const all = (await api("GET", "/v1/alerts")).json!.data as { id: string; acknowledgedAt: string | null; kind: string; day: string }[];
    const ackd = all.find((a) => a.acknowledgedAt)!;
    await store.record({ deviceKey: "d1", kind: ackd.kind, message: "again", at: new Date(`${ackd.day}T12:00:00Z`) });
    const after = (await api("GET", "/v1/alerts")).json!.data as { id: string; acknowledgedAt: string | null; count: number }[];
    const same = after.find((a) => a.id === ackd.id)!;
    assert.ok(same.acknowledgedAt);
    assert.ok(same.count >= 2);
  });
});
