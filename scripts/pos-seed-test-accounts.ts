/**
 * Extra local accounts for the POS test checklist (docs/POS_TEST_CHECKLIST). Run after `npm run pos:demo`.
 *
 *   npx tsx scripts/pos-seed-test-accounts.ts
 *
 * Adds a second branch (Cranborne, prefix C) with its own cashier and catalog, a supervisor on
 * Harare Street, and users used for the negative login cases. Local database only.
 */
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed test accounts in production");
  const bcrypt = (await import("bcryptjs")).default;
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Store } = await import("@/database/store.model");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: User } = await import("@/database/user.model");
  const { default: Account } = await import("@/database/account.model");
  const { default: PosProduct } = await import("@/database/posProduct.model");
  await dbConnect();

  const harare = await Branch.findOne({ name: "Harare Street" });
  if (!harare) throw new Error("Run `npm run pos:demo` first");
  const store = await Store.findById(harare.storeId);

  let cran = await Branch.findOne({ name: "Cranborne" });
  if (!cran) cran = await Branch.create({ name: "Cranborne", location: "Harare", storeId: harare.storeId });
  await Branch.updateOne(
    { _id: cran._id },
    {
      $set: {
        "pos.enabled": true,
        "pos.invoicePrefix": "C",
        "pos.taxPercent": 15.5,
        "pos.taxCode": "A",
        "pos.taxInclusive": true,
        "pos.defaultCurrency": "USD",
        "pos.offlineLimitHours": 5,
        "pos.receipt": {
          companyName: "DEMO TRADING (PVT) LTD",
          branchName: "Cranborne",
          address: "45 Cranborne Road, Harare",
          phone: "+263 242 111111",
          email: "cranborne@demo.test",
          tin: "2000000000",
          vatNumber: "220000000",
          footerLines: ["Thank you for your business"],
        },
      },
    }
  );

  // A branch with POS switched off (for the "POS not enabled" case).
  let off = await Branch.findOne({ name: "Bulawayo (POS off)" });
  if (!off) off = await Branch.create({ name: "Bulawayo (POS off)", location: "Bulawayo", storeId: harare.storeId });

  const users = [
    { email: "cashier2@cranborne.test", name: "Rudo", surname: "Cashier", role: "cashier", branchId: cran._id, password: "Cashier@123456" },
    { email: "supervisor@harare.test", name: "Farai", surname: "Supervisor", role: "branch_user", branchId: harare._id, password: "Supervisor@123456" },
    { email: "cashier3@bulawayo.test", name: "Thando", surname: "Cashier", role: "cashier", branchId: off._id, password: "Cashier@123456" },
    // A second real branch user (Cranborne). Branch users are NOT on any allow-list and must stay branch users.
    { email: "supervisor2@cranborne.test", name: "Nyasha", surname: "Supervisor", role: "branch_user", branchId: cran._id, password: "Supervisor@123456" },
    // A user with no password account: must be refused with a clear message.
    { email: "nopassword@harare.test", name: "No", surname: "Password", role: "cashier", branchId: harare._id, password: null },
  ];
  for (const u of users) {
    let doc = await User.findOne({ email: u.email });
    if (!doc) doc = await User.create({ name: u.name, surname: u.surname, email: u.email, role: u.role, storeId: store?._id, branchId: u.branchId });
    else await User.updateOne({ _id: doc._id }, { $set: { role: u.role, branchId: u.branchId } });
    if (u.password) {
      await Account.findOneAndUpdate(
        { userId: doc._id, provider: "credentials" },
        { name: `${u.name} ${u.surname}`, password: await bcrypt.hash(u.password, 12), providerAccountId: u.email },
        { upsert: true }
      );
    }
    console.log(`${u.email}  ${u.role}  ${u.password ?? "(no password)"}`);
  }

  // The original test branch user must really be a branch user (roles are no longer auto-promoted).
  await User.updateOne({ email: "branch@testbranch.com" }, { $set: { role: "branch_user" } });

  // Remove the account an earlier version of this script created (no longer part of the checklist).
  await User.deleteOne({ email: "notallowed@harare.test" });

  const products = [
    { name: "LED Bulb 9W", code: "LB9", priceUsd: 2.6 },
    { name: "Padlock 40mm", code: "PL40", priceUsd: 5.5 },
    { name: "Cable 2.5mm per metre", code: "CAB25", priceUsd: 1.4 },
    { name: "Various", code: "VAR", priceUsd: 0.01, priceOnEntry: true },
  ];
  await PosProduct.bulkWrite(
    products.map((p) => ({
      updateOne: { filter: { branchId: cran!._id, name: p.name }, update: { $set: { ...p, branchId: cran!._id, isActive: true } }, upsert: true },
    }))
  );
  console.log(`Cranborne ${cran._id} ready (prefix C, ${products.length} products). Bulawayo POS-off branch ${off._id}.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
