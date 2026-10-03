/**
 * Local demo data for the POS: a Harare Street branch with POS on, a cashier login,
 * an exchange rate and a small priced catalog. Safe to run repeatedly. Local database only.
 *
 *   npm run pos:demo
 *
 * Cashier login: cashier@harare.test / Cashier@123456   (change or delete before any real use)
 */
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");

  const bcrypt = (await import("bcryptjs")).default;
  const { default: dbConnect } = await import("@/lib/mongoose");
  const { default: Store } = await import("@/database/store.model");
  const { default: Branch } = await import("@/database/branch.model");
  const { default: User } = await import("@/database/user.model");
  const { default: Account } = await import("@/database/account.model");
  const { default: ExchangeRate } = await import("@/database/exchangeRate.model");
  const { default: PosProduct } = await import("@/database/posProduct.model");

  await dbConnect();

  let store = await Store.findOne();
  if (!store) store = await Store.create({ name: "Demo Store" } as never);

  let branch = await Branch.findOne({ name: "Harare Street" });
  if (!branch) branch = await Branch.create({ name: "Harare Street", location: "Harare", storeId: store._id });
  await Branch.updateOne(
    { _id: branch._id },
    {
      $set: {
        "pos.enabled": true,
        "pos.invoicePrefix": "H",
        "pos.taxPercent": 15.5,
        "pos.taxCode": "A",
        "pos.taxInclusive": true,
        "pos.defaultCurrency": "USD",
        "pos.offlineLimitHours": 5,
        "pos.receipt": {
          companyName: "DEMO TRADING (PVT) LTD",
          branchName: "Harare Street",
          address: "12 Harare Street, Harare",
          phone: "+263 242 000000",
          email: "harare@demo.test",
          tin: "2000000000",
          vatNumber: "220000000",
          footerLines: ["Thank you for your business", "Please call again"],
        },
      },
    }
  );

  const email = "cashier@harare.test";
  let cashier = await User.findOne({ email });
  if (!cashier) {
    cashier = await User.create({ name: "Tendai", surname: "Cashier", email, role: "cashier", storeId: store._id, branchId: branch._id });
  } else {
    await User.updateOne({ _id: cashier._id }, { $set: { role: "cashier", branchId: branch._id } });
  }
  await Account.findOneAndUpdate(
    { userId: cashier._id, provider: "credentials" },
    { name: "Tendai Cashier", password: await bcrypt.hash("Cashier@123456", 12), providerAccountId: email },
    { upsert: true }
  );

  if (!(await ExchangeRate.findOne({ currency: "ZWG" }))) {
    await ExchangeRate.create({ currency: "ZWG", rate: 26.5, effectiveDate: new Date(Date.now() - 86_400_000), notes: "demo" });
  }

  const products = [
    { name: "LED Bulb 9W", code: "LB9", priceUsd: 2.5 },
    { name: "LED Bulb 12W", code: "LB12", priceUsd: 3.2 },
    { name: "Extension Cord 5m", code: "EC5", priceUsd: 8.99 },
    { name: "Circuit Breaker 20A", code: "CB20", priceUsd: 6.75 },
    { name: "Twin Socket", code: "TS2", priceUsd: 4.1, priceZwg: 115 },
    { name: "Cable 2.5mm per metre", code: "CAB25", priceUsd: 1.35 },
    { name: "Wall Switch", code: "WS1", priceUsd: 1.9 },
    { name: "Various", code: "VAR", priceUsd: 0.01, priceOnEntry: true },
    { name: "Wiring labour", code: "WIRE", priceUsd: 0.01, priceOnEntry: true },
  ];
  await PosProduct.bulkWrite(
    products.map((p) => ({
      updateOne: { filter: { branchId: branch!._id, name: p.name }, update: { $set: { ...p, branchId: branch!._id, isActive: true } }, upsert: true },
    }))
  );

  console.log(`Branch "Harare Street" (${branch._id}) ready, prefix H, ${products.length} products.`);
  console.log(`Cashier login: ${email} / Cashier@123456`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
