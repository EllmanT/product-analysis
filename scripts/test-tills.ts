/**
 * Till checks (Phase 1): the number of tills per branch is a setting, sales carry their till, a till from
 * another branch is refused, and the per-till report adds up. Throw-away database, no device needed
 * (sales simply stay queued, which the report counts as pending).
 *
 *   npm run test:tills
 */
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

process.env.MONGO_DB_NAME = "pos_tills_tmp";
process.env.MONGODB_URI = process.env.OFFLINE_MONGODB_URI || "mongodb://localhost:27017/";
process.env.OFFLINE_MONGODB_URI = process.env.MONGODB_URI;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.FISCAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
// Never let this test reach a real device: the app falls back to the environment's URL when no fiscal
// settings exist, so clear it and point the settings at a port nothing listens on.
delete process.env.ZIMRA_API_URL;
delete process.env.ZIMRA_VD_EMAIL;
delete process.env.ZIMRA_VD_PASSWORD;

let failures = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

async function main() {
  console.log("\nTill checks\n");
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: PosSale } = await import("@/database/posSale.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: FiscalSettings } = await import("@/database/fiscalSettings.model");
  const tills = await import("@/lib/services/posTill.service");
  const pos = await import("@/lib/services/posSale.service");

  const m = await dbConnect();
  await m.connection.dropDatabase();
  await FiscalSettings.create({ zimraApiUrl: "http://127.0.0.1:1", deviceId: "0", deviceSerialNumber: "NONE" });
  const storeId = new m.Types.ObjectId();
  const mk = (name: string, prefix: string) =>
    Branch.create({
      name, storeId, location: name,
      pos: { enabled: true, invoicePrefix: prefix, taxPercent: 15.5, taxCode: "A", taxInclusive: true, defaultCurrency: "USD" },
    });
  const harare = await mk("Harare", "H");
  const gweru = await mk("Gweru", "G");
  await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000) });
  const hid = String(harare._id);
  const gid = String(gweru._id);
  const cashier = String(new m.Types.ObjectId());

  console.log("1. Number of tills is a setting");
  let list = await tills.setTillCount(hid, 5);
  check(list.length === 5 && list.every((t) => t.enabled), "5 tills created and on", list.length);
  check(list.map((t) => t.code).join() === "T1,T2,T3,T4,T5", "codes are T1..T5", list.map((t) => t.code));
  list = await tills.setTillCount(hid, 3);
  check(list.length === 5 && list.filter((t) => t.enabled).length === 3, "reducing to 3 switches the last two off, nothing deleted");
  check(list.filter((t) => !t.enabled).map((t) => t.code).join() === "T4,T5", "the highest-numbered are the ones switched off");
  list = await tills.setTillCount(hid, 4);
  check(list.length === 5 && list.filter((t) => t.enabled).length === 4, "raising to 4 re-uses T4 instead of creating a new till");
  check((await tills.listTills(hid)).length === 4, "the terminal list shows enabled tills only");
  const renamed = await tills.updateTill(list[0].id, { name: "Front counter" });
  check(renamed.name === "Front counter", "a till can be renamed");
  const refused = await tills.setTillCount(hid, 99).then(() => null, (e) => e);
  check(refused instanceof tills.TillError, "an absurd count is refused");
  const other = await tills.setTillCount(gid, 2);
  check(other.length === 2 && (await tills.listTills(hid, { includeDisabled: true })).length === 5, "another branch has its own tills");

  console.log("2. Sales carry their till");
  const t1 = list[0];
  const t2 = list[1];
  const sell = (tillId: string | undefined, branchId = hid) =>
    pos.createPosSale({
      branchId, cashierId: cashier, tillId, idempotencyKey: `t-${randomBytes(8).toString("hex")}`,
      currency: "USD", paymentMethod: "CASH", isTest: false,
      lines: [{ description: "Bread", quantity: 1, unitPrice: 2 }],
    });
  const a = await sell(t1.id);
  const b = await sell(t1.id);
  const c = await sell(t2.id);
  const d = await sell(undefined);
  check(String(a.tillId) === t1.id && a.tillCode === "T1", "the sale records its till id and code", { t: a.tillId, c: a.tillCode });
  check(!d.tillId, "a sale without a till is still accepted (tills are optional)");
  const wrong = await sell(other[0].id).then(() => null, (e) => e);
  check(wrong instanceof pos.PosError && wrong.code === "BAD_TILL", "a till from another branch is refused", wrong?.message);
  const bad = await sell("507f1f77bcf86cd799439011").then(() => null, (e) => e);
  check(bad instanceof pos.PosError && bad.code === "BAD_TILL", "an unknown till is refused");
  await tills.updateTill(t2.id, { enabled: false });
  const late = await sell(t2.id);
  check(String(late.tillId) === t2.id, "a switched-off till can still sync a sale it made earlier");
  check(a.invoiceNumber !== b.invoiceNumber || !a.invoiceNumber, "tills in one branch never share an invoice number", [a.invoiceNumber, b.invoiceNumber]);

  console.log("3. Per-till report");
  const today = pos.todayInTz();
  const rows = await tills.tillReport(hid, today, today);
  const row = (code: string) => rows.filter((r) => r.code === code).reduce((n, r) => n + r.sales + r.pending, 0);
  check(row("T1") === 2, "T1 shows its 2 sales", rows);
  check(row("T2") === 2, "T2 shows its 2 sales (one made after it was switched off)");
  check(row("-") === 1, "the sale without a till is shown separately");
  check(rows.every((r) => r.sales + r.pending > 0), "no empty rows");
  const count = await PosSale.countDocuments({ branchId: harare._id });
  check(rows.reduce((n, r) => n + r.sales + r.pending, 0) === count, "the report adds up to every sale in the branch", { count });

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
