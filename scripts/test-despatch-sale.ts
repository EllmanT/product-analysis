/**
 * Despatch-slip flow against a throw-away database: the inbox is branch- and till-scoped, a slip can be
 * invoiced once (even with two tills racing), a voided sale gives its slip back, a lost background job
 * does not hang the phone, and an emailed invoice is held until the sale is fiscalised. No device and no
 * AI call: scans are filled in by hand and sales simply stay queued.
 *
 *   npm run test:despatch-sale
 */
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

process.env.MONGO_DB_NAME = "pos_despatch_tmp";
process.env.MONGODB_URI = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.OFFLINE_MONGODB_URI = process.env.MONGODB_URI;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ZIMRA_API_URL;
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

async function main() {
  console.log("\nDespatch slip flow\n");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: DespatchScan } = await import("@/database/despatchScan.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const scans = await import("@/lib/services/despatchScan.service");
  const tills = await import("@/lib/services/posTill.service");
  const pos = await import("@/lib/services/posSale.service");
  const mail = await import("@/lib/services/posInvoiceEmail.service");

  const m = await dbConnect();
  await m.connection.dropDatabase();
  await FiscalSettings.create({ zimraApiUrl: "http://127.0.0.1:1", deviceId: "0", deviceSerialNumber: "NONE" });
  const storeId = new m.Types.ObjectId();
  const mk = (name: string, prefix: string) =>
    Branch.create({
      name, storeId, location: name,
      pos: { enabled: true, invoicePrefix: prefix, taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD", receipt: { companyName: "Test Co" } },
    });
  const harare = await mk("Harare", "H");
  const gweru = await mk("Gweru", "G");
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });
  const hid = String(harare._id);
  const gid = String(gweru._id);
  const cashier = String(new m.Types.ObjectId());
  const [t1, t2] = await tills.setTillCount(hid, 2);

  const photo = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), randomBytes(200 + n)]);
  /** An uploaded scan the AI step has "finished": ready, with a slip number and one line. */
  async function readyScan(opts: { branchId?: string; tillId?: string; slipNumber?: string } = {}) {
    const { scanId } = await scans.createDespatchScan({ branchId: opts.branchId ?? hid, tillId: opts.tillId, userId: cashier, image: photo(1), mime: "image/jpeg" });
    await DespatchScan.updateOne(
      { _id: scanId },
      {
        $set: {
          status: "ready",
          slipNumber: opts.slipNumber,
          slipNumberKey: opts.slipNumber?.toUpperCase().replace(/[^A-Z0-9]/g, ""),
          lines: [{ lineNo: 1, code: "X1", description: "Bulb", quantity: 2, slipUnitPrice: 5, slipTotal: 10, matchKind: "none", hsCode: "99001000", issues: [] }],
        },
      }
    );
    return scanId;
  }
  const sell = (extra: Record<string, unknown> = {}) =>
    pos.createPosSale({
      branchId: hid, cashierId: cashier, idempotencyKey: `t-${randomBytes(8).toString("hex")}`,
      currency: "USD", paymentMethod: "CASH",
      lines: [{ description: "Bulb", hsCode: "99001000", quantity: 2, unitPrice: 5 }],
      ...extra,
    });
  const fails = <T>(p: Promise<T>) => p.then(() => null, (e: unknown) => e as { code?: string; status?: number; message?: string });

  console.log("1. Upload and inbox");
  const img = photo(0);
  const first = await scans.createDespatchScan({ branchId: hid, userId: cashier, image: img, mime: "image/jpeg" });
  const again = await fails(scans.createDespatchScan({ branchId: hid, userId: cashier, image: img, mime: "image/jpeg" }));
  check(again instanceof scans.DespatchScanError && again.status === 409 && again.existingScanId === first.scanId, "the same photo twice is refused and points at the first scan", again);
  const sameElsewhere = await fails(scans.createDespatchScan({ branchId: gid, userId: cashier, image: img, mime: "image/jpeg" }));
  check(sameElsewhere === null, "the same photo in another branch is fine");
  const big = await fails(scans.createDespatchScan({ branchId: hid, userId: cashier, image: Buffer.alloc(scans.MAX_SLIP_IMAGE_BYTES + 1), mime: "image/jpeg" }));
  check(big instanceof scans.DespatchScanError && big.status === 413, "an oversized photo is refused");
  const wrongTill = await fails(scans.createDespatchScan({ branchId: gid, tillId: t1.id, userId: cashier, image: photo(2), mime: "image/jpeg" }));
  check(wrongTill instanceof tills.TillError, "a till from another branch is refused", wrongTill);

  const forT1 = await readyScan({ tillId: t1.id });
  const forAny = await readyScan();
  const t1Inbox = (await scans.listDespatchScans({ branchId: hid, tillId: t1.id })).map((s) => s.id);
  const t2Inbox = (await scans.listDespatchScans({ branchId: hid, tillId: t2.id })).map((s) => s.id);
  check(t1Inbox.includes(forT1) && t1Inbox.includes(forAny), "a till sees scans aimed at it and scans for any till");
  check(!t2Inbox.includes(forT1) && t2Inbox.includes(forAny), "another till does not see a scan aimed at the first");
  check((await scans.listDespatchScans({ branchId: gid })).every((s) => s.branchId === gid), "a branch only sees its own scans");
  check((await scans.getDespatchScan(forAny, gid)) === null, "a scan cannot be read through another branch");
  check((await scans.getDespatchScanImage(forAny, gid)) === null && (await scans.getDespatchScanImage(forAny, hid)) !== null, "the photo is branch-scoped too");

  console.log("2. A lost background job does not hang the phone");
  const stuck = await scans.createDespatchScan({ branchId: hid, userId: cashier, image: photo(3), mime: "image/jpeg" });
  await DespatchScan.collection.updateOne({ _id: new m.Types.ObjectId(stuck.scanId) }, { $set: { createdAt: new Date(Date.now() - 10 * 60_000) } });
  const polled = await scans.getDespatchScan(stuck.scanId, hid);
  check(polled?.status === "failed" && /too long/.test(polled.processingError ?? ""), "a scan stuck in processing fails when polled", polled?.status);
  const fresh = await scans.createDespatchScan({ branchId: hid, userId: cashier, image: photo(4), mime: "image/jpeg" });
  check((await scans.getDespatchScan(fresh.scanId, hid))?.status === "processing", "a fresh scan is left alone");

  console.log("3. One slip, one invoice");
  const s1 = await readyScan({ slipNumber: "DS-0012" });
  const sale1 = await sell({ source: { scanId: s1 } });
  check(sale1.source?.slipNumber === "DS-0012" && sale1.source?.slipNumberKey === "DS0012", "the sale records the slip number taken from the scan");
  const after1 = await scans.getDespatchScan(s1, hid);
  check(after1?.status === "applied" && !!after1.appliedAt, "the scan leaves the inbox once a sale exists");
  const retry = await pos.createPosSale({ branchId: hid, cashierId: cashier, idempotencyKey: sale1.idempotencyKey, currency: "USD", lines: [{ description: "Bulb", quantity: 2, unitPrice: 5 }], source: { scanId: s1 } });
  check(String(retry._id) === String(sale1._id), "a retry with the same key returns the same sale");
  const dupScan = await fails(sell({ source: { scanId: s1 } }));
  check(dupScan?.code === "DUPLICATE_SLIP" && dupScan.status === 409, "the same scan cannot be invoiced again", dupScan);
  const s1b = await readyScan({ slipNumber: "ds 0012" });
  const dupNumber = await fails(sell({ source: { scanId: s1b } }));
  check(dupNumber?.code === "DUPLICATE_SLIP", "a second photo of the same slip number is refused", dupNumber);
  check((await scans.getDespatchScan(s1b, hid))?.status === "ready", "a refused scan stays in the inbox");
  const foreign = await readyScan({ branchId: gid });
  const cross = await fails(sell({ source: { scanId: foreign } }));
  check(cross?.code === "BAD_SOURCE", "another branch's scan cannot be used", cross);
  const missing = await fails(sell({ source: { scanId: "507f1f77bcf86cd799439011" } }));
  check(missing?.code === "BAD_SOURCE", "an unknown scan is refused");

  console.log("4. Two tills racing for one slip");
  const race = await readyScan({ slipNumber: "DS-0099" });
  const results = await Promise.allSettled([sell({ source: { scanId: race } }), sell({ source: { scanId: race } }), sell({ source: { scanId: race } })]);
  check(results.filter((r) => r.status === "fulfilled").length === 1, "exactly one of three simultaneous sales succeeds", results.map((r) => r.status));
  check((await PosSale.countDocuments({ "source.scanId": new m.Types.ObjectId(race) })) === 1, "only one sale exists for the slip");

  console.log("5. A voided sale gives its slip back");
  const voided = await pos.voidPosSale(String(sale1._id)).then((s) => s, (e: unknown) => e as Error);
  check(!(voided instanceof Error) && voided.status === "VOIDED", "the unfiscalised sale is voided", (voided as Error).message);
  check((await scans.getDespatchScan(s1, hid))?.status === "ready", "the slip is back in the inbox");
  const resold = await sell({ source: { scanId: s1 } }).then(() => true, () => false);
  check(resold, "the slip can be invoiced again");

  console.log("6. Emailed invoice");
  const noName = await fails(sell({ emailInvoice: true, buyer: { email: "a@b.co" } }));
  check(noName?.code === "EMAIL_NEEDS_CUSTOMER", "emailing needs the customer name", noName);
  const noEmail = await fails(sell({ emailInvoice: true, buyer: { registerName: "Acme" } }));
  check(noEmail?.code === "EMAIL_NEEDS_CUSTOMER", "emailing needs a valid email");
  const plain = await sell({ buyer: { registerName: "Acme", email: "a@b.co" } });
  check(!plain.emailRequest, "no email is queued unless it was asked for");
  const emailed = await sell({ emailInvoice: true, buyer: { registerName: "Acme", email: "buyer@example.com" } });
  check(emailed.emailRequest?.status === "pending" && emailed.emailRequest.to === "buyer@example.com", "an email request is queued with the sale");
  check((await mail.processPendingInvoiceEmail(String(emailed._id))) === "waiting", "an unfiscalised sale is held, not sent");
  const held = await PosSale.findById(emailed._id);
  check(held?.emailRequest?.status === "pending" && held.emailRequest.attempts === 0 && !!held.emailRequest.nextAttemptAt, "waiting is not counted as a failed attempt");
  check((await mail.processPendingInvoiceEmail(String(emailed._id))) === "skipped", "it is not retried before its time (and a second worker is turned away)");

  // Fiscalised, but the seller's TIN is not set: never send an invalid tax invoice.
  await PosSale.updateOne(
    { _id: emailed._id },
    {
      $set: {
        status: "FISCALISED", invoiceNumber: "H9001",
        fiscal: { verificationCode: "AAAA-BBBB", verificationLink: "https://example.test/v", qrCodeUrl: "https://example.test/q", deviceId: "1", receiptGlobalNo: "H9001", receiptDate: "2026-11-02T10:00:00" },
        "emailRequest.nextAttemptAt": new Date(Date.now() - 1000),
      },
    }
  );
  check((await mail.processPendingInvoiceEmail(String(emailed._id))) === "failed", "an invoice missing seller details is refused, not sent");
  const refused = await PosSale.findById(emailed._id);
  check(refused?.emailRequest?.status === "failed" && /seller TIN/.test(refused.emailRequest.lastError ?? ""), "the reason names what is missing", refused?.emailRequest?.lastError);
  check((refused?.emailedTo?.length ?? 0) === 0, "nothing was recorded as sent");

  const toVoid = await sell({ emailInvoice: true, buyer: { registerName: "Acme", email: "buyer@example.com" } });
  await PosSale.updateOne({ _id: toVoid._id }, { $set: { status: "VOIDED", "emailRequest.nextAttemptAt": new Date(Date.now() - 1000) } });
  check((await mail.processPendingInvoiceEmail(String(toVoid._id))) === "failed", "a voided sale's email request is closed");

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
