/**
 * Close-day guard checks (Phase 0). Runs against ONE fake Virtual Device on a local port and a throw-away
 * database (dropped at the start); it never touches a real device or your dev data.
 *
 *   npm run test:close-guard
 *
 * Verifies: a normal close; one close at a time per device; the fence queues new sales during a close;
 * a refused receipt is flagged and blocks the scheduled close until an admin reviews it; a CountersMismatch
 * close failure is read from the device and recorded (and does not stop selling); a validation-error close
 * failure is permanent and is not re-sent by the scheduler.
 */
import * as dotenv from "dotenv";
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

process.env.MONGO_DB_NAME = "pos_close_guard_tmp";
process.env.MONGODB_URI = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.OFFLINE_MONGODB_URI = process.env.MONGODB_URI;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- a fake Virtual Device with switches for the failures we care about --------------------------------------
type DayStatus = "FiscalDayClosed" | "FiscalDayOpened" | "FiscalDayCloseFailed";
interface Rec { invoiceNo: string; total: number; currency: string; globalNo: number; lines: unknown }
const fake = {
  port: 19411,
  deviceId: "9001",
  serial: "VR-GUARD",
  status: "FiscalDayClosed" as DayStatus,
  closingError: undefined as string | undefined,
  day: 0,
  receipts: [] as Rec[],
  /** "ok" closes the day; the others fail the close the way the real Virtual Device does. */
  closeMode: "ok" as "ok" | "CountersMismatch" | "ReceiptsWithValidationErrors",
  closeDelayMs: 0,
  closeCalls: 0,
  /** When true SubmitReceipt answers with a validation refusal and stores nothing. */
  refuseSubmits: false,
  server: undefined as http.Server | undefined,
};
const pad10 = (n: number) => String(n).padStart(10, "0");

function envelope(r: Rec) {
  const code = `X${fake.deviceId}${r.globalNo}`.slice(-8).toUpperCase().padStart(8, "X");
  return {
    Code: "1",
    DeviceID: fake.deviceId,
    DeviceSerialNumber: fake.serial,
    FiscalDayNo: fake.day,
    VerificationCode: code,
    VerificationLink: `https://fdmstest.zimra.co.zw/${code}`,
    QRCode: `https://fdmstest.zimra.co.zw/${fake.deviceId}${pad10(r.globalNo)}${code}`,
    Data: {
      receipt: {
        receiptGlobalNo: r.globalNo,
        receiptCounter: r.globalNo,
        invoiceNo: `${fake.deviceId}-${r.invoiceNo}`,
        receiptDate: new Date().toISOString(),
        receiptTotal: r.total,
        receiptCurrency: r.currency,
        receiptLines: r.lines,
      },
    },
  };
}

function statusReply() {
  const body = { fiscalDayStatus: fake.status, lastReceiptGlobalNo: fake.receipts.length, lastFiscalDayNo: fake.day, ...(fake.closingError ? { fiscalDayClosingErrorCode: fake.closingError } : {}) };
  // Exactly like the real device: a failed close answers Code "0" with the state inside Message.
  if (fake.status === "FiscalDayCloseFailed") return { Code: "0", Message: JSON.stringify(body), DeviceID: fake.deviceId, DeviceSerialNumber: fake.serial };
  return { Code: "1", FiscalDayNo: fake.day, Data: body };
}

function startFake(): Promise<void> {
  return new Promise((resolve) => {
    fake.server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", async () => {
        const send = (o: unknown, s = 200) => {
          res.writeHead(s, { "Content-Type": "application/json" });
          res.end(JSON.stringify(o));
        };
        const p = new URL(req.url ?? "/", "http://x").pathname;
        if (p.endsWith("/GetStatus")) return send(statusReply());
        if (p.endsWith("/OpenFiscalDay")) {
          if (fake.status === "FiscalDayOpened") return send({ Code: "0", Message: "Fiscal day already open" });
          fake.day++;
          fake.status = "FiscalDayOpened";
          fake.closingError = undefined;
          return send({ Code: "1", FiscalDayNo: fake.day });
        }
        if (p.endsWith("/CloseFiscalDay")) {
          fake.closeCalls++;
          if (fake.closeDelayMs) await sleep(fake.closeDelayMs);
          if (fake.status === "FiscalDayClosed") return send({ Code: "0", Message: "Fiscal day is closed" });
          if (fake.closeMode !== "ok") {
            fake.status = "FiscalDayCloseFailed";
            fake.closingError = fake.closeMode;
            return send({ Code: "0", Message: `Close Fiscal Day Request Failed: ${JSON.stringify(statusReply().Message ? JSON.parse(statusReply().Message as string) : {})}` });
          }
          fake.status = "FiscalDayClosed";
          return send({ Code: "1", FiscalDayNo: fake.day, Data: { fiscalDayNo: fake.day, counters: [] } });
        }
        if (p.endsWith("/GetUnProcessedInvoicesSummary")) return send({ Code: "1", Data: { TotalRecords: 0 } });
        if (p.endsWith("/GetConfig")) return send({ Code: "1", DeviceID: fake.deviceId, DeviceSerialNumber: fake.serial, Data: { deviceSerialNo: fake.serial } });
        if (p.includes("/GetInvoice/")) {
          const n = decodeURIComponent(p.split("/GetInvoice/")[1]);
          const r = fake.receipts.find((x) => x.invoiceNo === n);
          return send(r ? envelope(r) : { Code: "0", Message: `Transaction with Invoice Number '${n}' not found in the device.` });
        }
        if (p.endsWith("/SubmitReceipt") || p.endsWith("/SubmitReceiptExt")) {
          const body = JSON.parse(raw || "{}") as Record<string, unknown>;
          if (fake.status === "FiscalDayClosed") return send({ Code: "0", Message: "Fiscal day is closed. Open the fiscal day first" });
          if (fake.refuseSubmits) return send({ Code: "0", Message: "RCPT020 Invalid signature or totals do not match" });
          const r: Rec = {
            invoiceNo: String(body["invoiceNo"]),
            total: Number(body["invoiceAmount"]),
            currency: String(body["receiptCurrency"]),
            globalNo: fake.receipts.length + 1,
            lines: body["receiptLines"] ?? [],
          };
          fake.receipts.push(r);
          return send(envelope(r));
        }
        send({ Code: "0", Message: `No route ${p}` }, 404);
      });
    });
    fake.server.listen(fake.port, "127.0.0.1", () => resolve());
  });
}

async function main() {
  console.log("\nClose-day guard checks\n");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: ZReport } = await import("@/database/zReport.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const { default: FiscalCloseAttempt } = await import("@/database/fiscalCloseAttempt.model");
  const pos = await import("@/lib/services/posSale.service");
  const ops = await import("@/lib/services/fiscalDayOps.service");
  const control = await import("@/lib/services/fiscalDayControl.service");
  const { getPosDeviceStatus } = await import("@/lib/services/zimraPosDevice.service");

  const m = await dbConnect();
  await m.connection.dropDatabase();
  await startFake();

  await FiscalSettings.create({ zimraApiUrl: `http://127.0.0.1:${fake.port}`, deviceId: fake.deviceId, deviceSerialNumber: fake.serial });
  const branch = await Branch.create({
    name: "Harare", storeId: new m.Types.ObjectId(), location: "Harare",
    pos: { enabled: true, invoicePrefix: "H", taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD" },
  });
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });
  await ops.openFiscalDayOnly("central");

  const cashier = String(new m.Types.ObjectId());
  let n = 0;
  const sell = () =>
    pos.createPosSale({
      branchId: String(branch._id), cashierId: cashier, idempotencyKey: `g-${n++}-${randomBytes(3).toString("hex")}`,
      currency: "USD", paymentMethod: "CASH", isTest: false,
      lines: [{ description: "Bread", quantity: 2, unitPrice: 1.5 }],
    });
  const reopen = async () => {
    // Fresh day for the next scenario: clear any failed state through the device's own open call.
    fake.status = "FiscalDayClosed";
    fake.closingError = undefined;
    fake.closeMode = "ok";
    await ops.openFiscalDayOnly("central");
  };

  // 1. A normal close
  console.log("1. Normal close");
  const s1 = await sell();
  check(s1.status === "FISCALISED", "sale is fiscalised", s1.status);
  const z1 = await ops.closeFiscalDayWithReport("manual", {});
  check(!!z1 && fake.status === "FiscalDayClosed", "day closes and a Z-report is kept");
  const a1 = await FiscalCloseAttempt.find({ outcome: "closed" }).lean();
  check(a1.length === 1, "the attempt is recorded as closed", a1.length);
  check(await control.acquireCloseLock("central", "probe"), "the lock is released after the close");
  await control.releaseCloseLock("central", "probe");
  await reopen();

  // 2. One close at a time
  console.log("2. Two closes at once");
  fake.closeDelayMs = 700;
  const settled = await Promise.allSettled([ops.closeFiscalDayWithReport("scheduled", {}), ops.closeFiscalDayWithReport("manual", {})]);
  fake.closeDelayMs = 0;
  const ok2 = settled.filter((r) => r.status === "fulfilled").length;
  const blocked2 = settled.filter((r) => r.status === "rejected" && r.reason instanceof ops.CloseInProgressError).length;
  check(ok2 === 1 && blocked2 === 1, "one close runs, the other is refused as already in progress", settled.map((r) => r.status));
  await reopen();

  // 3. The fence queues new sales during a close
  console.log("3. Fence");
  await control.acquireCloseLock("central", "fence-test");
  await control.raiseFence("central", "fence-test");
  const during = await sell();
  check(during.status === "UNFISCALISED" && /closed|closing/i.test(during.lastError ?? ""), "a sale made during the fence is queued, not sent", { s: during.status, e: during.lastError });
  check(fake.receipts.length === 0 || !fake.receipts.some((r) => r.invoiceNo === during.invoiceNumber), "nothing reached the device while fenced");
  await control.releaseCloseLock("central", "fence-test");
  await PosSale.collection.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 3_600_000) } });
  await pos.runPosQueue(25, { deviceKey: "central" });
  const after = await PosSale.findById(during._id).lean<{ status: string }>();
  check(after?.status === "FISCALISED", "the queued sale is fiscalised once the fence is gone", after?.status);
  await ops.closeFiscalDayWithReport("manual", {});
  await reopen();

  // 4. A refused receipt is flagged and holds back the scheduled close
  console.log("4. Refused receipt");
  fake.refuseSubmits = true;
  const bad = await sell();
  fake.refuseSubmits = false;
  const badDoc = await PosSale.findById(bad._id).lean<{ status: string; needsReview?: boolean; reviewNote?: string }>();
  check(badDoc?.status === "FAILED" && badDoc.needsReview === true, "the sale is FAILED and flagged for review", badDoc);
  const sched = await ops.closeFiscalDayWithReport("scheduled", { force: true }).then(() => null, (e) => e);
  check(sched instanceof ops.ReviewRequiredError, "a scheduled close (even forced) is held back", sched?.message);
  const manual = await ops.closeFiscalDayWithReport("manual", {}).then(() => null, (e) => e);
  check(manual instanceof ops.ReviewRequiredError, "a normal manual close is held back too", manual?.message);
  check(fake.status === "FiscalDayOpened", "the device was not asked to close");
  await pos.clearSaleReview(String(bad._id));
  const z4 = await ops.closeFiscalDayWithReport("scheduled", {});
  check(!!z4 && fake.status === "FiscalDayClosed", "after review the close goes through");
  await reopen();

  // 5. CountersMismatch is read from the device, recorded, and does not stop selling
  console.log("5. Close refused: CountersMismatch");
  await sell();
  fake.closeMode = "CountersMismatch";
  const e5 = await ops.closeFiscalDayWithReport("scheduled", {}).then(() => null, (e) => e);
  check(e5 instanceof ops.FiscalCloseError && e5.errorCode === "CountersMismatch" && !e5.permanent, "close fails with CountersMismatch, not permanent", e5?.message);
  const st5 = await getPosDeviceStatus();
  check(st5.reachable && st5.dayStatus === "FiscalDayCloseFailed" && st5.closingErrorCode === "CountersMismatch", "the device is read as reachable, CloseFailed, with its reason", st5);
  check(st5.dayOpen === true, "a failed close still takes receipts");
  const sell5 = await sell();
  check(sell5.status === "FISCALISED", "selling continues after a failed close", sell5.status);
  const rec5 = await FiscalCloseAttempt.findOne({ outcome: "failed", errorCode: "CountersMismatch" }).lean();
  check(!!rec5, "the failed attempt is recorded with its reason");
  fake.closeMode = "ok";
  const z5 = await ops.closeFiscalDayWithReport("scheduled", {});
  check(!!z5 && fake.status === "FiscalDayClosed", "a later retry closes the day");
  await reopen();

  // 6. ReceiptsWithValidationErrors is permanent
  console.log("6. Close refused: ReceiptsWithValidationErrors");
  await sell();
  fake.closeMode = "ReceiptsWithValidationErrors";
  const e6 = await ops.closeFiscalDayWithReport("scheduled", {}).then(() => null, (e) => e);
  check(e6 instanceof ops.FiscalCloseError && e6.errorCode === "ReceiptsWithValidationErrors" && e6.permanent, "close fails and is marked permanent", e6?.message);
  const callsBefore = fake.closeCalls;
  const e6b = await ops.closeFiscalDayWithReport("scheduled", {}).then(() => null, (e) => e);
  check(e6b instanceof ops.FiscalCloseError && e6b.permanent && fake.closeCalls === callsBefore, "the scheduler does not send the close again", { calls: fake.closeCalls - callsBefore });

  fake.server?.closeAllConnections?.();
  fake.server?.close();
  await m.connection.dropDatabase();
  await m.connection.close();

  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
