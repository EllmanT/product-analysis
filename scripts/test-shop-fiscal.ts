/**
 * Shop invoices and the fiscal layer: mapping, failure classification, retry timing, and the queue.
 * The ZIMRA call is injected, so every case is deterministic. Needs MongoDB (a throw-away database).
 *
 *   npx tsx scripts/test-shop-fiscal.ts
 */
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Types } from "mongoose";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
const MONGO = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.MONGO_DB_NAME = `shop_fiscal_tmp_${randomBytes(3).toString("hex")}`;
process.env.MONGODB_URI = MONGO;
process.env.OFFLINE_MONGODB_URI = MONGO;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};

async function main() {
  const { buildInvoiceServiceRequest, classifyShopFiscalError, SHOP_MAX_ATTEMPTS, ShopFiscalError, shopRetryDelayMs, toInvoiceFiscalData } = await import("@/lib/fiscal/invoiceMapping");
  const { issueShopInvoice, runShopInvoiceQueue } = await import("@/lib/services/shopFiscal.service");
  const { default: Invoice } = await import("@/database/invoice.model");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const mongoose = (await import("mongoose")).default;

  console.log("1. Mapping an invoice for the fiscal service");
  const inv = {
    _id: new Types.ObjectId(),
    invoiceNumber: "INV-0001",
    receiptCurrency: "USD",
    taxInclusive: true,
    paymentMethod: "CARD" as const,
    receiptType: "FiscalInvoice" as const,
    receiptNotes: "  ",
    totalAmount: 230,
    lines: [
      { lineNo: 1, lineType: "Sale", hsCode: "12345678", description: "Router", quantity: 2, unitPrice: 100, taxCode: "A", taxPercent: 15.5, vatAmount: 27.83, lineTotalExcl: 172.17, lineTotalIncl: 200 },
      { lineNo: 2, lineType: "Sale", description: "Cable", quantity: 1, unitPrice: 30, taxCode: "A", taxPercent: 15.5, vatAmount: 4.03, lineTotalExcl: 25.97, lineTotalIncl: 30 },
    ],
    buyerSnapshot: { registerName: "Acme", tradeName: "", tin: "1234567", vatNumber: "", email: "buyer@acme.test", phone: "", address: "1 Main St", city: "Harare", province: "Harare" },
  };
  const req = buildInvoiceServiceRequest(inv, "99001000");
  check(req.invoiceNo === "INV-0001" && req.receiptType === "FiscalInvoice" && req.taxInclusive === true, "invoice number, type and tax mode carry over");
  check(req.lines[0]!.unitPrice === "100.00" && req.lines[0]!.quantity === 2 && req.lines[0]!.hsCode === "12345678", "a line keeps its price (as text), quantity and HS code");
  check(req.lines[1]!.hsCode === "99001000", "a line without an HS code gets the default");
  check(req.payments[0]!.moneyType === "Card" && req.payments[0]!.amount === "230.00", "payment method and total map");
  check((req.buyer as { buyerRegisterName?: string; buyerContacts?: { email?: string } } | undefined)?.buyerRegisterName === "Acme" && (req.buyer as { buyerContacts?: { email?: string } }).buyerContacts?.email === "buyer@acme.test", "a named buyer is sent with its contact");
  check(!("buyer" in buildInvoiceServiceRequest({ ...inv, buyerSnapshot: { ...inv.buyerSnapshot, registerName: "", tradeName: "", tin: "", address: "", city: "" } }, "x")), "an empty buyer is not sent");
  check(!("notes" in req), "blank notes are not sent");
  let credit = "";
  try {
    buildInvoiceServiceRequest({ ...inv, receiptType: "CreditNote" }, "x");
  } catch (e) {
    credit = e instanceof ShopFiscalError ? e.kind : "other";
  }
  check(credit === "review", "a credit note is not silently sent as an invoice");
  const fd = toInvoiceFiscalData({ invoiceNo: "INV-0001", status: "fiscalised", receiptGlobalNo: 77, receiptCounter: 5, fiscalDayNo: 12, deviceId: 31591, qrData: "https://fdmstest.zimra.co.zw/x", verificationCode: "ABCD1234EFGH5678", receiptId: 99 });
  check(fd.verificationCode === "ABCD-1234-EFGH-5678" && fd.deviceId === "31591" && fd.receiptGlobalNo === "77" && fd.qrCodeUrl.startsWith("https://"), "the stored result has the QR, code, device and numbers");

  console.log("2. Failures: retry or review");
  for (const m of ["ZIMRA request timeout", "Fiscal day is closed. Please open the fiscal day", "ZIMRA device not ready: Unknown error", "fetch failed", "DEVICE_PAUSED: paused"]) {
    check(classifyShopFiscalError(m) === "retry", `retried: ${m}`);
  }
  for (const m of ["Invoice has no fiscal line items.", "RCPT026: tax mismatch", "HS_CODE_REQUIRED: line 1", "validation error on the receipt"]) {
    check(classifyShopFiscalError(m) === "review", `needs a person: ${m}`);
  }
  check([1, 2, 3, 4, 5, 6, 100].map(shopRetryDelayMs).join() === [60_000, 120_000, 300_000, 600_000, 1_800_000, 1_800_000, 1_800_000].join(), "retry delay grows from 1 minute and settles at 30");

  await dbConnect();
  const make = async (extra: Record<string, unknown> = {}) =>
    Invoice.create({
      quotationId: new Types.ObjectId(),
      customerId: new Types.ObjectId(),
      invoiceNumber: `T-${randomBytes(4).toString("hex")}`,
      items: [{ productId: new Types.ObjectId(), name: "x", standardCode: "x", quantity: 1, unitPrice: "10", lineTotal: "10" }],
      subtotal: "10",
      totalAmount: 10,
      lines: [{ lineNo: 1, description: "x", quantity: 1, unitPrice: 10, taxPercent: 15.5 }],
      ...extra,
    });
  const fresh = async (id: unknown) => (await Invoice.findById(id).lean<Record<string, unknown>>())!;
  const t0 = new Date("2026-11-10T10:00:00Z");

  console.log("3. Issuing: done, queued, or for a person");
  const ok = await make();
  const okFiscalize = async (id: string) => void (await Invoice.updateOne({ _id: id }, { $set: { isFiscalized: true, fiscalStatus: "SUBMITTED", fiscalSubmittedAt: new Date() } }));
  const r1 = await issueShopInvoice(String(ok._id), { fiscalize: okFiscalize, now: () => t0 });
  check(r1.status === "FISCALISED", "a working device: FISCALISED");

  const down = await make();
  const r2 = await issueShopInvoice(String(down._id), { fiscalize: async () => { throw new Error("ZIMRA request timeout"); }, now: () => t0 });
  const d2 = await fresh(down._id);
  check(r2.status === "QUEUED", "ZIMRA down: QUEUED, not an error", r2);
  check(d2.fiscalAttempts === 1 && /timeout/.test(String(d2.fiscalLastError)), "the attempt and the reason are recorded");
  check(new Date(d2.fiscalNextRetryAt as Date).getTime() === t0.getTime() + 60_000, "the next try is one minute later");
  check(d2.isFiscalized === false && d2.fiscalNeedsReview === false, "it is still waiting, not flagged");

  const bad = await make();
  const r3 = await issueShopInvoice(String(bad._id), { fiscalize: async () => { throw new ShopFiscalError("RCPT026: tax mismatch", "review"); }, now: () => t0 });
  const d3 = await fresh(bad._id);
  check(r3.status === "REVIEW" && d3.fiscalNeedsReview === true && !d3.fiscalNextRetryAt, "an invoice that is wrong goes to review and leaves the queue");

  const already = await make();
  const r4 = await issueShopInvoice(String(already._id), { fiscalize: async () => { throw new Error("Invoice already fiscalized"); }, now: () => t0 });
  check(r4.status === "FISCALISED", "'already fiscalised' counts as done");

  const tired = await make({ fiscalAttempts: SHOP_MAX_ATTEMPTS - 1 });
  const r5 = await issueShopInvoice(String(tired._id), { fiscalize: async () => { throw new Error("ZIMRA request timeout"); }, now: () => t0 });
  check(r5.status === "REVIEW", "after too many failures a person is asked to look", r5);

  console.log("4. The queue");
  // `down` is due at t0 + 1 min.
  let calls = 0;
  const counting = async (id: string) => {
    calls++;
    await okFiscalize(id);
  };
  const early = await runShopInvoiceQueue(10, { fiscalize: counting, now: () => new Date(t0.getTime() + 30_000), deviceReady: async () => true });
  check(early.attempted === 0 && calls === 0, "nothing is tried before its retry time");

  const notReady = await runShopInvoiceQueue(10, { fiscalize: counting, now: () => new Date(t0.getTime() + 61_000), deviceReady: async () => false });
  check(notReady.attempted === 0 && notReady.waiting === 1 && calls === 0, "when the device is not ready nothing is tried and the invoice waits");

  const stillBad = await runShopInvoiceQueue(10, { fiscalize: async () => { throw new Error("ZIMRA request timeout"); }, now: () => new Date(t0.getTime() + 61_000), deviceReady: async () => true });
  const d6 = await fresh(down._id);
  check(stillBad.stillQueued === 1 && d6.fiscalAttempts === 2, "a failed retry stays queued with one more attempt");
  check(new Date(d6.fiscalNextRetryAt as Date).getTime() === t0.getTime() + 61_000 + 120_000, "and waits two minutes this time");

  const done = await runShopInvoiceQueue(10, { fiscalize: counting, now: () => new Date(t0.getTime() + 5 * 60_000), deviceReady: async () => true });
  const d7 = await fresh(down._id);
  check(done.fiscalised === 1 && calls === 1 && d7.isFiscalized === true, "when ZIMRA is back the invoice is fiscalised by the queue");
  check(!d7.fiscalNextRetryAt && !d7.fiscalLastError, "and its retry marks are cleared");

  const draft = await make(); // an admin's draft: never handed to the payment flow, so it has no retry time
  const none = await runShopInvoiceQueue(10, { fiscalize: counting, now: () => new Date(t0.getTime() + 10 * 60_000), deviceReady: async () => true });
  const d8 = await fresh(draft._id);
  check(none.attempted === 0 && d8.isFiscalized === false, "an invoice that was never queued is left for the admin");
  const review = await fresh(bad._id);
  check(review.isFiscalized === false && review.fiscalNeedsReview === true, "an invoice in review is not retried");

  await mongoose.connection.db!.dropDatabase();
  await mongoose.disconnect();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.connection.db?.dropDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
