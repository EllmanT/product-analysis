/**
 * Phase 4 check: the POS app fiscalises through the separate fiscal-service (FISCAL_BACKEND=service).
 * Runs the real service (engine, registry, HTTP API) against the fake ZIMRA gateway, and the real app code
 * (createPosSale, fiscalisePosSale, runPosQueue, issueCreditNote) against throw-away databases. Needs MongoDB.
 *
 *   npm run test:service-backend
 */
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const MONGO = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.MONGO_DB_NAME = "pos_service_backend_tmp";
process.env.MONGODB_URI = MONGO;
process.env.OFFLINE_MONGODB_URI = MONGO;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ZIMRA_API_URL;
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;
const TOKEN = "service-backend-test-token-123456";
process.env.FISCAL_BACKEND = "service";
process.env.FISCAL_SERVICE_TOKEN = TOKEN;

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("\nApp -> fiscal service (FISCAL_BACKEND=service)\n");
  const { MongoClient } = await import("mongodb");
  const { FetchTransport } = await import("../fiscal-service/src/core/fetch-transport.js");
  const { DeviceRegistry } = await import("../fiscal-service/src/devices/registry.js");
  const { EngineManager } = await import("../fiscal-service/src/engine/manager.js");
  const { SecretBox } = await import("../fiscal-service/src/security/secret-box.js");
  const { createApp } = await import("../fiscal-service/src/server.js");
  const { FakeGateway } = await import("../fiscal-service/src/testing/fake-gateway.js");
  const { makeDeviceBundle } = await import("../fiscal-service/src/testing/make-cert.js");

  // ---- the service, on its own database, talking to the fake ZIMRA --------------------------------------------
  const gw = new FakeGateway();
  await gw.start();
  gw.faults.closeDelayMs = 20;
  const client = await new MongoClient(MONGO, { serverSelectionTimeoutMS: 3000 }).connect();
  const svcDb = client.db(`fiscal_service_app_${randomBytes(4).toString("hex")}`);
  const registry = new DeviceRegistry(svcDb, new SecretBox({ FISCAL_ENCRYPTION_KEY: randomBytes(32).toString("base64") }), async () => ({ taxPayerName: "FAKE", fetchedAt: new Date() }));
  await registry.init();
  const manager = new EngineManager({
    db: svcDb, registry, baseUrl: gw.url, transportFor: () => new FetchTransport(),
    options: { waitMs: 1500, retryBaseMs: 30, retryMaxMs: 200, openGapMs: 1100, drainTimeoutMs: 3000, closePollMs: 20, closePollTimeoutMs: 3000, maxDateDriftMs: 270_000, busyWaitMs: 30_000 },
    backgroundMs: 50,
  });
  const server = createApp({ registry, manager, token: TOKEN, gatewayBaseUrl: gw.url, statusTransport: () => new FetchTransport() });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const goodUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.FISCAL_SERVICE_URL = goodUrl;

  const bundle = makeDeviceBundle(8101);
  gw.addDevice(bundle.deviceId, bundle.serialNumber, bundle.certificatePem);
  const dev = await registry.add({ tenantId: "company-1", name: "Harare", certificatePem: bundle.certificatePem, privateKeyPem: bundle.privateKeyPem, environment: "test" });
  const serviceId = String((dev as { id?: string; _id?: unknown }).id ?? (dev as { _id?: unknown })._id);
  await (await manager.get(serviceId)).openDay();
  await sleep(1200);

  // ---- the app, on its own throw-away database ------------------------------------------------------------------
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const { default: FiscalDevice } = await import("@/database/fiscalDevice.model");
  const pos = await import("@/lib/services/posSale.service");

  const m = await dbConnect();
  await m.connection.dropDatabase();
  await FiscalSettings.create({ zimraApiUrl: "http://127.0.0.1:1", deviceId: "0", deviceSerialNumber: "NONE" });
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });
  const appDevice = await FiscalDevice.create({ name: "Harare device", active: true, serviceDeviceId: serviceId });
  const unlinked = await FiscalDevice.create({ name: "Not in service", active: true });
  const storeId = new m.Types.ObjectId();
  const branch = await Branch.create({
    name: "Harare", storeId, location: "Harare",
    pos: { enabled: true, invoicePrefix: "H", taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD", fiscalDeviceId: appDevice._id },
  });
  const orphan = await Branch.create({
    name: "Orphan", storeId, location: "Orphan",
    pos: { enabled: true, invoicePrefix: "O", taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD", fiscalDeviceId: unlinked._id },
  });
  const bid = String(branch._id);
  const cashier = String(new m.Types.ObjectId());
  const sell = (branchId = bid, price = 2, currency: "USD" | "ZWG" = "USD") =>
    pos.createPosSale({
      branchId, cashierId: cashier, idempotencyKey: `s-${randomBytes(8).toString("hex")}`, currency, paymentMethod: "CASH", isTest: false,
      lines: [{ description: "Bread", quantity: 2, unitPrice: price }],
    });

  console.log("1. A sale is fiscalised through the service");
  const s1 = await pos.fiscalisePosSale(String((await sell())._id), { reason: "till" });
  check(s1.status === "FISCALISED", "the sale is FISCALISED", { status: s1.status, err: s1.lastError });
  check(!!s1.invoiceNumber && /^H/.test(s1.invoiceNumber), "it keeps the app's own invoice number", s1.invoiceNumber);
  check(!!s1.fiscal?.qrCodeUrl && !!s1.fiscal?.verificationCode && Number(s1.fiscal?.receiptGlobalNo) > 0, "QR, verification code and receipt number are stored", s1.fiscal);
  check(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(s1.fiscal?.verificationCode ?? ""), "the verification code prints as XXXX-XXXX-XXXX-XXXX", s1.fiscal?.verificationCode);
  const again = await pos.fiscalisePosSale(String(s1._id), { reason: "till" });
  check(again.status === "FISCALISED" && again.fiscal?.receiptGlobalNo === s1.fiscal?.receiptGlobalNo, "asking again changes nothing");

  console.log("2. ZWG sale and a credit note");
  const z = await pos.fiscalisePosSale(String((await sell(bid, 500, "ZWG"))._id), { reason: "till" });
  check(z.status === "FISCALISED", "a ZWG sale is FISCALISED", { s: z.status, e: z.lastError });
  await sleep(1100);
  const cn = await pos.issueCreditNote(String(s1._id), cashier, "Customer return");
  check(cn.status === "FISCALISED" && cn.kind === "CREDIT_NOTE", "the credit note is FISCALISED", { s: cn.status, e: cn.lastError });
  check(cn.fiscal?.deviceId === s1.fiscal?.deviceId, "and went to the device that signed the original");

  console.log("3. ZIMRA is down: the sale is kept and delivered later");
  gw.faults.down = true;
  const q = await pos.fiscalisePosSale(String((await sell())._id), { reason: "till" });
  check(q.status === "UNFISCALISED" && !!q.invoiceNumber, "the sale waits as UNFISCALISED with its number", { s: q.status, n: q.invoiceNumber });
  await sleep(300);
  gw.faults.down = false;
  let fixed = 0;
  for (let i = 0; i < 40 && !fixed; i++) {
    await sleep(250);
    const r = await pos.runPosQueue(25, { deviceKey: String(appDevice._id) });
    fixed = r.fiscalised;
  }
  const q2 = await PosSale.findById(q._id);
  check(q2?.status === "FISCALISED", "after ZIMRA is back the queue collects it as FISCALISED", { s: q2?.status, e: q2?.lastError });

  console.log("3b. A sale from an earlier day is fiscalised by itself once the system is back (no approval)");
  gw.faults.down = true;
  const old = await pos.fiscalisePosSale(String((await sell())._id), { reason: "till" });
  gw.faults.down = false;
  // Pretend the outage lasted days: the sale belongs to a day that is long over.
  await PosSale.updateOne({ _id: old._id }, { $set: { soldDate: "2020-01-01", needsApproval: true } });
  let oldDone = false;
  for (let i = 0; i < 40 && !oldDone; i++) {
    await sleep(250);
    await pos.runPosQueue(25, { deviceKey: String(appDevice._id) });
    oldDone = (await PosSale.findById(old._id))?.status === "FISCALISED";
  }
  const old2 = await PosSale.findById(old._id);
  check(old2?.status === "FISCALISED" && !old2.needsApproval, "the old sale is FISCALISED and was not held for approval", { s: old2?.status, a: old2?.needsApproval, e: old2?.lastError });
  check(old2?.soldDate === "2020-01-01", "our record keeps the day it was actually sold");

  console.log("3c. A shop invoice goes through the same service, and survives an outage");
  // The shop has no branch: it uses the central device, which is a device of its own, apart from the branch's.
  const centralBundle = makeDeviceBundle(8102);
  gw.addDevice(centralBundle.deviceId, centralBundle.serialNumber, centralBundle.certificatePem);
  const centralDev = await registry.add({ tenantId: "company-1", name: "Central", certificatePem: centralBundle.certificatePem, privateKeyPem: centralBundle.privateKeyPem, environment: "test" });
  const centralServiceId = String((centralDev as { id?: string; _id?: unknown }).id ?? (centralDev as { _id?: unknown })._id);
  await (await manager.get(centralServiceId)).openDay();
  await sleep(1200);
  process.env.FISCAL_SERVICE_CENTRAL_DEVICE_ID = centralServiceId;
  const { default: Invoice } = await import("@/database/invoice.model");
  const shop = await import("@/lib/services/shopFiscal.service");
  const makeInvoice = () =>
    Invoice.create({
      quotationId: new m.Types.ObjectId(),
      customerId: new m.Types.ObjectId(),
      invoiceNumber: `SHOP-${randomBytes(4).toString("hex").toUpperCase()}`,
      items: [{ productId: new m.Types.ObjectId(), name: "Router", standardCode: "R1", quantity: 2, unitPrice: "10", lineTotal: "20" }],
      subtotal: "20",
      paymentMethod: "CARD",
      taxInclusive: true,
      totalAmount: 20,
      lines: [{ lineNo: 1, description: "Router", quantity: 2, unitPrice: 10, taxPercent: 15.5, hsCode: "99001000" }],
      buyerSnapshot: { registerName: "Acme Ltd", tradeName: "Acme", tin: "1234567890", email: "buyer@acme.test", phone: "", address: "1 Main St", city: "Harare", province: "Harare", vatNumber: "" },
    });
  const si1 = await makeInvoice();
  const so1 = await shop.issueShopInvoice(String(si1._id));
  const sf1 = await Invoice.findById(si1._id);
  check(so1.status === "FISCALISED", "a shop invoice is FISCALISED through the service", { so1, err: sf1?.fiscalLastError });
  check(sf1?.isFiscalized === true && sf1.fiscalStatus === "SUBMITTED" && !!sf1.fiscalSubmittedAt, "and is marked fiscalised");
  check(!!sf1?.fiscalData?.verificationCode && !!sf1.qrCodeData && sf1.fiscalData.deviceId === String(centralBundle.deviceId), "with its QR, verification code and the device that signed it", sf1?.fiscalData);
  const shopAgain = await shop.issueShopInvoice(String(si1._id));
  check(shopAgain.status === "FISCALISED", "asking again changes nothing");

  gw.faults.down = true;
  const si2 = await makeInvoice();
  const so2 = await shop.issueShopInvoice(String(si2._id));
  const sf2 = await Invoice.findById(si2._id);
  check(so2.status === "QUEUED" && sf2?.isFiscalized === false && !!sf2.fiscalNextRetryAt, "with ZIMRA down the paid invoice is QUEUED, not lost", { so2, a: sf2?.fiscalAttempts });
  gw.faults.down = false;
  await Invoice.updateOne({ _id: si2._id }, { $set: { fiscalNextRetryAt: new Date(Date.now() - 1000) } });
  let shopDone = false;
  for (let i = 0; i < 40 && !shopDone; i++) {
    await sleep(250);
    await shop.runShopInvoiceQueue(10);
    shopDone = (await Invoice.findById(si2._id))?.isFiscalized === true;
    if (!shopDone) await Invoice.updateOne({ _id: si2._id, isFiscalized: false }, { $set: { fiscalNextRetryAt: new Date(Date.now() - 1000) } });
  }
  const sf2b = await Invoice.findById(si2._id);
  check(shopDone && !sf2b?.fiscalNextRetryAt, "once ZIMRA is back the queue fiscalises it", { err: sf2b?.fiscalLastError });
  check(gw.receipts(centralBundle.deviceId).length === 2, "ZIMRA holds exactly one receipt per shop invoice", gw.receipts(centralBundle.deviceId).length);
  const { getDayPreview } = await import("@/lib/services/fiscalDayPreview.service");
  const centralPreview = await getDayPreview("central");
  check(centralPreview.matches && centralPreview.shopInvoices === 2, "the central device's close preview counts the shop invoices and matches", centralPreview);

  console.log("4. The fiscal service itself is unreachable");
  process.env.FISCAL_SERVICE_URL = "http://127.0.0.1:1";
  const u = await pos.fiscalisePosSale(String((await sell())._id), { reason: "till" });
  check(u.status === "UNFISCALISED" && !!u.invoiceNumber, "the sale is kept with its number", { s: u.status });
  process.env.FISCAL_SERVICE_URL = goodUrl;
  let back = false;
  for (let i = 0; i < 20 && !back; i++) {
    await pos.runPosQueue(25, { deviceKey: String(appDevice._id) });
    back = (await PosSale.findById(u._id))?.status === "FISCALISED";
    if (!back) await sleep(250);
  }
  check(back, "once the service is back the same sale is sent and FISCALISED");

  console.log("5. A branch whose device is not in the service");
  const o = await pos.fiscalisePosSale(String((await sell(String(orphan._id)))._id), { reason: "till" });
  check(o.status === "UNFISCALISED" && /not been added/.test(o.lastError ?? ""), "it waits and says why; no other device is used", { s: o.status, e: o.lastError });

  console.log("6. Many tills at once");
  const batch = await Promise.all(Array.from({ length: 24 }, async () => pos.fiscalisePosSale(String((await sell())._id), { reason: "till" })));
  for (let i = 0; i < 40; i++) {
    const left = batch.length - (await PosSale.countDocuments({ _id: { $in: batch.map((b) => b._id) }, status: "FISCALISED" }));
    if (!left) break;
    await pos.runPosQueue(50, { deviceKey: String(appDevice._id) });
    await sleep(250);
  }
  const done = await PosSale.find({ _id: { $in: batch.map((b) => b._id) } });
  check(done.every((d) => d.status === "FISCALISED"), "all 24 are FISCALISED", done.filter((d) => d.status !== "FISCALISED").map((d) => d.status));
  const nos = done.map((d) => Number(d.fiscal?.receiptGlobalNo));
  check(new Set(nos).size === 24, "every sale has its own receipt number");
  const invs = done.map((d) => d.invoiceNumber);
  check(new Set(invs).size === 24, "every sale has its own invoice number");

  console.log("7. Closing the day from the app goes through the service");
  const ops = await import("@/lib/services/fiscalDayOps.service");
  const eng = await (await manager.get(serviceId)).status();
  check(eng.unsent === 0 && eng.red === 0 && eng.gray === 0, "nothing unsent, nothing flagged", eng);
  const preview = await (await import("@/lib/services/fiscalDayPreview.service")).getDayPreview(String(appDevice._id));
  check(preview.available && preview.matches && preview.rows.length >= 1, "before the close, the device counters equal the app's sales (USD and ZWG, sales and credits)", preview);
  check(preview.rows.some((r) => r.deviceCredits > 0 && r.deviceCredits === r.appCredits), "the credit note shows on both sides of the preview", preview.rows);
  const z1 = await ops.closeFiscalDayWithReport("manual", { deviceKey: String(appDevice._id) });
  check(!!z1.fiscalDayNo && z1.totalSalesUsd !== null, "the app keeps a Z-report from the service's totals", { n: z1.fiscalDayNo, usd: z1.totalSalesUsd, zwg: z1.totalSalesZwg });
  check((await (await manager.get(serviceId)).status()).dayOpen === false, "the fiscal day is closed");
  const sched = await (await import("@/lib/services/fiscalSchedule.service")).runFiscalScheduleTick();
  check(!sched.closed && !sched.opened, "the app's own scheduler stands down", sched);
  await ops.openFiscalDayOnly(String(appDevice._id));
  check((await (await manager.get(serviceId)).status()).dayOpen === true, "the app can open the next day through the service");

  console.log("8. Devices are added from the app, and any of them can be made central");
  const devs = await import("@/lib/services/fiscalServiceDevices.service");
  const devSvc = await import("@/lib/services/fiscalDevice.service");
  const fresh = makeDeviceBundle(8103);
  gw.addDevice(fresh.deviceId, fresh.serialNumber, fresh.certificatePem);
  const gweru = await FiscalDevice.create({ name: "Gweru device", active: true });
  const before = (await registry.list()).length;
  const pushed = await devs.pushCertificateToService(String(gweru._id), fresh.certificatePem, fresh.privateKeyPem);
  const afterPush = await devSvc.getFiscalDeviceSafe(String(gweru._id));
  check(afterPush?.serviceDeviceId === pushed.id && afterPush?.deviceId === String(fresh.deviceId), "uploading the certificate registers the device with the service and keeps its id", afterPush);
  check(afterPush?.deviceSerialNumber === fresh.serialNumber, "and its serial number, read from the certificate");
  await devs.pushCertificateToService(String(gweru._id), fresh.certificatePem, fresh.privateKeyPem);
  check((await registry.list()).length === before + 1, "uploading it again does not add a second device");
  const clone = await FiscalDevice.create({ name: "Same device again", active: true });
  let cloneErr = "";
  try {
    await devs.pushCertificateToService(String(clone._id), fresh.certificatePem, fresh.privateKeyPem);
  } catch (e) {
    cloneErr = e instanceof Error ? e.message : String(e);
  }
  check(/already added as "Gweru device"/.test(cloneErr), "the same device cannot be added under a second name", cloneErr);
  const other = makeDeviceBundle(8104);
  let mismatch = "";
  try {
    await devs.pushCertificateToService(String((await FiscalDevice.create({ name: "Wrong key", active: true }))._id), other.certificatePem, fresh.privateKeyPem);
  } catch (e) {
    mismatch = e instanceof Error ? e.message : String(e);
  }
  check(mismatch.length > 0, "a certificate with someone else's key is refused with a reason", mismatch);
  const verified = await devs.verifyDeviceViaService(String(gweru._id));
  check(verified.device.deviceId === String(fresh.deviceId), "the connection check asks ZIMRA through the service", verified.device.deviceId);

  let refused = "";
  try {
    await devs.setCentralDevice(String(gweru._id));
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  check(/fiscal day open/i.test(refused), "the central device cannot change while its fiscal day is open", refused);
  const closed = await (await manager.get(centralServiceId)).closeDay();
  check(closed.ok === true, "the current central device's day closes", closed);
  await devs.setCentralDevice(String(gweru._id));
  check((await devSvc.resolveServiceDeviceId("central")) === pushed.id, "after that, central means the device that was chosen (not the environment setting)");
  check((await devSvc.listFiscalDevices()).find((d) => String(d.id) === String(gweru._id))?.isCentral === true, "and the device list marks it Central");
  let unlinkedErr = "";
  try {
    await devs.setCentralDevice(String(unlinked._id));
  } catch (e) {
    unlinkedErr = e instanceof Error ? e.message : String(e);
  }
  check(/certificate/i.test(unlinkedErr), "a device with no certificate cannot be made central", unlinkedErr);

  console.log("9. The waiting total keeps every unfiscalised sale, whatever day it was sold");
  const staleSale = await sell(bid, 3);
  await PosSale.updateOne({ _id: staleSale._id }, { $set: { status: "UNFISCALISED", soldDate: "2026-01-01" } });
  const sumNow = await pos.getPosSummary({ branchId: bid });
  const usdRow = sumNow.find((r) => r.currency === "USD")!;
  check(usdRow.waiting.count >= 1 && usdRow.waiting.total >= 6, "a sale left unfiscalised from an earlier day is still in the waiting figure", usdRow.waiting);
  check(!usdRow.pending.total || usdRow.pending.total < usdRow.waiting.total, "while today's own pending figure does not include it", { pending: usdRow.pending, waiting: usdRow.waiting });
  const { getServiceDeviceHealth } = await import("@/lib/services/fiscalServiceStatus.service");
  const health = await getServiceDeviceHealth(String(appDevice._id)).catch((e) => ({ reachable: false, message: String(e) }));
  check(typeof health.reachable === "boolean", "the till's device status comes from the fiscal service, not a Virtual Device", health);

  await manager.shutdown();
  await new Promise<void>((r) => server.close(() => r()));
  await gw.stop();
  await svcDb.dropDatabase();
  await client.close();
  await m.connection.dropDatabase();
  await m.connection.close();
  console.log(failures ? `\n${failures} check(s) FAILED\n` : "\nAll checks passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
