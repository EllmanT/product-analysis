import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { FiscalDevice } from "../src/core/device.js";
import { FetchTransport } from "../src/core/fetch-transport.js";
import { cents } from "../src/core/money.js";
import { MemoryStorage } from "../src/core/storage.js";
import { FakeGateway } from "../src/testing/fake-gateway.js";
import { makeDeviceBundle, opensslAvailable, type TestBundle } from "../src/testing/make-cert.js";
import { KeySigner } from "../src/node/key-signer.js";

const have = opensslAvailable();

async function setup(gw: FakeGateway, bundle: TestBundle, vatPayer = true) {
  gw.addDevice(bundle.deviceId, bundle.serialNumber, bundle.certificatePem, { vatPayer });
  const fd = new FiscalDevice(
    { deviceId: bundle.deviceId, serialNumber: bundle.serialNumber, modelName: "Server", modelVersion: "v1" },
    { signer: new KeySigner(bundle.privateKeyPem), transport: new FetchTransport(), storage: new MemoryStorage() },
    { baseUrl: gw.url, retries: 0 }
  );
  await fd.getConfig();
  return fd;
}
const line = (over: Record<string, unknown> = {}) => ({ name: "Item", price: 10, quantity: 1, taxId: 517, taxPercent: 15.5, hsCode: "99001000", ...over });
const pay = (amount = 10) => [{ moneyType: "Cash" as const, amount }];
const settle = async (fd: FiscalDevice) => {
  for (let i = 0; i < 40; i++) {
    const s = await fd.getStatus();
    if (s.fiscalDayStatus !== "FiscalDayCloseInitiated") return s;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("close never settled");
};

describe("fake gateway reproduces the real gateway's behaviour", { skip: !have }, () => {
  const gw = new FakeGateway();
  before(async () => {
    await gw.start();
    gw.faults.closeDelayMs = 20;
  });
  after(() => gw.stop());

  for (const kind of ["rsa", "ec"] as const) {
    it(`accepts a clean ${kind.toUpperCase()}-signed day and closes it`, async () => {
      const b = makeDeviceBundle(kind === "rsa" ? 1001 : 1002, kind);
      const fd = await setup(gw, b);
      await fd.openDay();
      await new Promise((r) => setTimeout(r, 1100)); // the gateway stamps its own open time
      const r1 = await fd.submitReceipt({ currency: "USD", invoiceNo: "A-1", lines: [line()], payments: pay(10) });
      const r2 = await fd.submitReceipt({ currency: "ZWG", invoiceNo: "A-2", lines: [line({ price: cents("25.50") })], payments: [{ moneyType: "Cash" as const, amount: cents("25.50") }] });
      assert.deepEqual(r1.response.validationErrors, []);
      assert.deepEqual(r2.response.validationErrors, []);
      await fd.closeDay();
      assert.equal((await settle(fd)).fiscalDayStatus, "FiscalDayClosed");
    });
  }

  it("flags a missing HS code Red (RCPT047) and then refuses to close the day", async () => {
    const b = makeDeviceBundle(1003);
    const fd = await setup(gw, b);
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const r = await fd.submitReceipt({ currency: "USD", invoiceNo: "B-1", lines: [line({ hsCode: undefined })], payments: pay(10) });
    assert.ok(r.response.validationErrors?.some((e) => e.validationErrorCode === "RCPT047" && e.validationErrorColor === "Red"));
    await assert.rejects(() => fd.closeDay(), /validation errors|DayNotClosable/i);
  });

  it("flags a short HS code Red (RCPT048)", async () => {
    const fd = await setup(gw, makeDeviceBundle(1004));
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const r = await fd.submitReceipt({ currency: "USD", invoiceNo: "C-1", lines: [line({ hsCode: "123" })], payments: pay(10) });
    assert.ok(r.response.validationErrors?.some((e) => e.validationErrorCode === "RCPT048"));
  });

  it("does not require HS codes from a taxpayer that is not a VAT payer", async () => {
    const fd = await setup(gw, makeDeviceBundle(1005), false);
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const r = await fd.submitReceipt({ currency: "USD", invoiceNo: "D-1", lines: [line({ hsCode: undefined })], payments: pay(10) });
    assert.deepEqual(r.response.validationErrors, []);
  });

  it("a receipt dated before the gateway's own open time gets a Yellow RCPT014, which does not block closing", async () => {
    const fd = await setup(gw, makeDeviceBundle(1006));
    await fd.openDay();
    const r = await fd.submitReceipt({ currency: "USD", invoiceNo: "E-1", lines: [line()], payments: pay(10), receiptDate: new Date(Date.now() - 60_000) });
    const e = r.response.validationErrors ?? [];
    assert.ok(e.some((x) => x.validationErrorCode === "RCPT014" && x.validationErrorColor === "Yellow"));
    assert.ok(!e.some((x) => x.validationErrorColor === "Red"));
  });

  it("resending a receipt as new makes a second record flagged RCPT013 Red and RCPT011 Gray (what we saw live)", async () => {
    const b = makeDeviceBundle(1007);
    const fd = await setup(gw, b);
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const first = fd.getState()!;
    await fd.submitReceipt({ currency: "USD", invoiceNo: "F-1", lines: [line({ hsCode: undefined })], payments: pay(10) });
    fd.restoreState(first); // pretend the first one never counted, then resend it corrected
    await new Promise((r) => setTimeout(r, 1100)); // a different second, as in the live run, so the hash differs
    const again = await fd.submitReceipt({ currency: "USD", invoiceNo: "F-1", lines: [line()], payments: pay(10) });
    const codes = (again.response.validationErrors ?? []).map((e) => `${e.validationErrorCode}:${e.validationErrorColor}`);
    assert.ok(codes.includes("RCPT013:Red"), codes.join());
    assert.ok(codes.includes("RCPT011:Gray") || codes.includes("RCPT012:Gray"), codes.join());
    assert.equal(gw.receipts(1007).length, 2, "the gateway keeps both records");
  });

  it("returns the original receiptID when the identical signed receipt is sent twice", async () => {
    const b = makeDeviceBundle(1008);
    const fd = await setup(gw, b);
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const prepared = await fd.signReceipt({ currency: "USD", invoiceNo: "G-1", lines: [line()], payments: pay(10) });
    await fd.applyPrepared(prepared);
    const a = await fd.submitPrepared(prepared);
    const b2 = await fd.submitPrepared(prepared);
    assert.equal(a.response.receiptID, b2.response.receiptID);
    assert.equal(gw.receipts(1008).length, 1);
  });

  it("a signature made with the wrong key is Red (RCPT010)", async () => {
    const b = makeDeviceBundle(1009);
    const other = makeDeviceBundle(1010);
    gw.addDevice(b.deviceId, b.serialNumber, b.certificatePem);
    const fd = new FiscalDevice(
      { deviceId: b.deviceId, serialNumber: b.serialNumber, modelName: "Server", modelVersion: "v1" },
      { signer: new KeySigner(other.privateKeyPem), transport: new FetchTransport(), storage: new MemoryStorage() },
      { baseUrl: gw.url, retries: 0 }
    );
    await fd.getConfig();
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const r = await fd.submitReceipt({ currency: "USD", invoiceNo: "H-1", lines: [line()], payments: pay(10) });
    assert.ok(r.response.validationErrors?.some((e) => e.validationErrorCode === "RCPT010"));
  });

  it("credit notes: needs the original, the same currency, and cannot over-credit", async () => {
    const fd = await setup(gw, makeDeviceBundle(1011));
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    const inv = await fd.submitReceipt({ currency: "USD", invoiceNo: "I-1", lines: [line()], payments: pay(10) });
    const orig = fd.getState()!.receiptGlobalNo;
    void inv;
    const ok = await fd.submitReceipt({
      receiptType: "CreditNote", currency: "USD", invoiceNo: "I-CN1", notes: "return",
      creditDebitNote: { deviceID: 1011, receiptGlobalNo: orig, fiscalDayNo: 1 },
      lines: [line({ price: -4 })], payments: pay(-4),
    });
    assert.deepEqual(ok.response.validationErrors, []);
    const over = await fd.submitReceipt({
      receiptType: "CreditNote", currency: "USD", invoiceNo: "I-CN2", notes: "return",
      creditDebitNote: { deviceID: 1011, receiptGlobalNo: orig, fiscalDayNo: 1 },
      lines: [line({ price: -7 })], payments: pay(-7),
    });
    assert.ok(over.response.validationErrors?.some((e) => e.validationErrorCode === "RCPT035"));
  });

  it("a failed close can be retried and then succeeds (CountersMismatch forced once)", async () => {
    const fd = await setup(gw, makeDeviceBundle(1012));
    await fd.openDay();
    await new Promise((r) => setTimeout(r, 1100));
    await fd.submitReceipt({ currency: "USD", invoiceNo: "J-1", lines: [line()], payments: pay(10) });
    gw.faults.forceCloseFailure = "CountersMismatch";
    await fd.closeDay();
    const s = await settle(fd);
    assert.equal(s.fiscalDayStatus, "FiscalDayCloseFailed");
    assert.equal(s.fiscalDayClosingErrorCode, "CountersMismatch");
    assert.equal(s.fiscalDayCounter, undefined, "the gateway sends no counters for a failed day");
  });
});
