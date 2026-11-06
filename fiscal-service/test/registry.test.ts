import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { MongoClient, type Db } from "mongodb";

import { DeviceRegistry, RegistryError, type GatewayVerifier } from "../src/devices/registry.js";
import { SecretBox, SecretBoxError } from "../src/security/secret-box.js";
import { createApp } from "../src/server.js";

const KEY = randomBytes(32).toString("base64");
const TOKEN = "test-token-0123456789abcdef";
const certDir = (id: number) => new URL(`../../test certificates/certificates_${id}/`, import.meta.url);
const haveCerts = existsSync(new URL("cert.crt", certDir(28892))) && existsSync(new URL("cert.crt", certDir(29234)));
const load = (id: number) => ({
  certificatePem: readFileSync(new URL("cert.crt", certDir(id)), "utf-8"),
  privateKeyPem: readFileSync(new URL("key.key", certDir(id)), "utf-8"),
});

describe("SecretBox", () => {
  it("round-trips and binds the value to its context", () => {
    const box = new SecretBox({ FISCAL_ENCRYPTION_KEY: KEY });
    const enc = box.encrypt("PRIVATE KEY BODY", "ctx:a");
    assert.ok(enc.startsWith("enc:v1:k1:"));
    assert.equal(box.decrypt(enc, "ctx:a"), "PRIVATE KEY BODY");
    assert.throws(() => box.decrypt(enc, "ctx:b"), SecretBoxError);
    assert.throws(() => box.decrypt(enc.slice(0, -3) + "AAA", "ctx:a"), SecretBoxError);
  });
  it("refuses to work without a strong key", () => {
    assert.throws(() => new SecretBox({}), /not set/);
    assert.throws(() => new SecretBox({ FISCAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") }), /not random enough/);
    assert.throws(() => new SecretBox({ FISCAL_ENCRYPTION_KEY: "c2hvcnQ=" }), /32 bytes/);
  });
  it("decrypts with an older key and reports it needs re-encrypting", () => {
    const old = new SecretBox({ FISCAL_ENCRYPTION_KEY: KEY, FISCAL_ENCRYPTION_KEY_ID: "k1" });
    const enc = old.encrypt("secret", "c");
    const rotated = new SecretBox({
      FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      FISCAL_ENCRYPTION_KEY_ID: "k2",
      FISCAL_ENCRYPTION_KEY_PREV: JSON.stringify({ k1: KEY }),
    });
    assert.equal(rotated.decrypt(enc, "c"), "secret");
    assert.ok(rotated.needsReencrypt(enc));
    assert.ok(!rotated.needsReencrypt(rotated.encrypt("x", "c")));
  });
});

describe("device registry and API", { skip: !haveCerts }, () => {
  let client: MongoClient;
  let db: Db;
  let registry: DeviceRegistry;
  let base = "";
  let closeServer: () => Promise<void>;
  let verifierCalls = 0;
  let verifierFails = false;

  const verifier: GatewayVerifier = async () => {
    verifierCalls++;
    if (verifierFails) throw new Error("401 Unauthorized");
    return { taxPayerName: "TEST TAXPAYER", deviceOperatingMode: "Online", fetchedAt: new Date() };
  };
  const api = async (method: string, path: string, body?: unknown, auth = true) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  };

  before(async () => {
    client = await new MongoClient(process.env.FISCAL_TEST_MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 3000 }).connect();
    db = client.db(`fiscal_service_test_${randomBytes(4).toString("hex")}`);
    registry = new DeviceRegistry(db, new SecretBox({ FISCAL_ENCRYPTION_KEY: KEY }), verifier);
    await registry.init();
    const server = createApp({ registry, token: TOKEN });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeServer = () => new Promise((r) => server.close(() => r()));
  });
  after(async () => {
    await closeServer?.();
    await db?.dropDatabase();
    await client?.close();
  });

  it("answers /health without a token and everything else only with one", async () => {
    assert.equal((await api("GET", "/health", undefined, false)).status, 200);
    assert.equal((await api("GET", "/v1/devices", undefined, false)).status, 401);
    const wrong = await fetch(base + "/v1/devices", { headers: { Authorization: "Bearer wrong-token-of-any-length" } });
    assert.equal(wrong.status, 401);
  });

  it("adds a device from just its certificate and key, reading id, serial and expiry from the certificate", async () => {
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name: "Harare till device", ...load(28892) });
    assert.equal(r.status, 201, r.text);
    const d = JSON.parse(r.text).data;
    assert.equal(d.deviceId, 28892);
    assert.equal(d.serialNumber, "VR-D6409ABB3D893936");
    assert.equal(d.keyType, "rsa");
    assert.ok(d.certDaysLeft > 100, "the renewed certificate is long-lived");
    assert.equal(d.taxPayerName, "TEST TAXPAYER");
  });

  it("never returns key material or the certificate body", async () => {
    const list = await api("GET", "/v1/devices");
    assert.equal(list.status, 200);
    assert.doesNotMatch(list.text, /PRIVATE KEY|privateKey|BEGIN CERTIFICATE|enc:v1/);
  });

  it("stores the key encrypted and the engine can read it back", async () => {
    const raw = await db.collection("devices").findOne({ deviceId: 28892 });
    assert.ok(String(raw?.["privateKeyEnc"]).startsWith("enc:v1:"));
    assert.doesNotMatch(JSON.stringify(raw), /BEGIN (RSA )?PRIVATE KEY/);
    const id = String(raw?.["_id"]);
    const ident = await registry.identity(id);
    assert.equal(ident.privateKeyPem.trim(), load(28892).privateKeyPem.trim());
  });

  it("refuses a device id that is already registered", async () => {
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name: "Again", ...load(28892) });
    assert.equal(r.status, 409);
  });

  it("refuses a private key that does not match the certificate", async () => {
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name: "Mismatch", certificatePem: load(29234).certificatePem, privateKeyPem: load(28892).privateKeyPem });
    assert.equal(r.status, 422);
    assert.match(r.text, /does not match/);
  });

  it("refuses text that is not a ZIMRA device certificate", async () => {
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name: "Junk", certificatePem: "nonsense", privateKeyPem: load(29234).privateKeyPem });
    assert.equal(r.status, 422);
  });

  it("stores nothing when ZIMRA does not accept the pair", async () => {
    verifierFails = true;
    const before = await db.collection("devices").countDocuments();
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name: "Revoked", ...load(29234) });
    verifierFails = false;
    assert.equal(r.status, 422);
    assert.match(r.text, /ZIMRA did not accept/);
    assert.equal(await db.collection("devices").countDocuments(), before);
  });

  it("adds a second device, lists both, and can switch one off", async () => {
    const r = await api("POST", "/v1/devices", { tenantId: "company-1", name: "Gweru device", ...load(29234) });
    assert.equal(r.status, 201, r.text);
    const list = JSON.parse((await api("GET", "/v1/devices")).text).data as { id: string; deviceId: number }[];
    assert.deepEqual(list.map((d) => d.deviceId), [28892, 29234]);
    const off = await api("POST", `/v1/devices/${list[1]!.id}/active`, { active: false });
    assert.equal(JSON.parse(off.text).data.active, false);
    await assert.rejects(() => registry.identity(list[1]!.id), RegistryError);
  });

  it("refuses to swap in another device's certificate", async () => {
    const list = JSON.parse((await api("GET", "/v1/devices")).text).data as { id: string; deviceId: number }[];
    const r = await api("PUT", `/v1/devices/${list[0]!.id}/certificate`, load(29234));
    assert.equal(r.status, 422);
    assert.match(r.text, /for device 29234, not 28892/);
  });

  it("rejects bad input without leaking internals", async () => {
    assert.equal((await api("POST", "/v1/devices", { name: "No tenant" })).status, 400);
    assert.equal((await api("GET", "/v1/devices/not-an-id/status")).status, 404);
    const nf = await api("GET", "/v1/devices/aaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(nf.status, 404);
  });
});
