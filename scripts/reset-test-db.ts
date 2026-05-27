/**
 * Reset the test database: drops all collections, then seeds roles + test users.
 *
 * Local (default): uses OFFLINE_MONGODB_URI (or MONGODB_URI as fallback).
 * Live:            pass --target=live to use MONGODB_URI only.
 *
 * Usage (from repo root):
 *   npx tsx scripts/reset-test-db.ts               # local DB
 *   npx tsx scripts/reset-test-db.ts --target=live  # Atlas DB
 *
 * Test credentials after reset:
 *   admin@testbranch.com  / Admin@123456
 *   branch@testbranch.com / Branch@123456
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const targetLive = args.includes("--target=live");

const rawUri = targetLive
  ? process.env.MONGODB_URI
  : process.env.OFFLINE_MONGODB_URI || process.env.MONGODB_URI;

const MONGODB_URI = rawUri?.replace(/\/?$/, "/stockflow");

if (!MONGODB_URI) {
  console.error(
    targetLive
      ? "❌ MONGODB_URI not set in .env.local (required for --target=live)"
      : "❌ OFFLINE_MONGODB_URI or MONGODB_URI not set in .env.local"
  );
  process.exit(1);
}

console.log(
  targetLive
    ? "🌐 Target: live (MONGODB_URI)\n"
    : "💻 Target: local (OFFLINE_MONGODB_URI)\n"
);

const StoreSchema = new mongoose.Schema(
  {
    name: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const BranchSchema = new mongoose.Schema(
  {
    name: String,
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    location: String,
  },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    name: String,
    surname: String,
    email: { type: String, unique: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    role: { type: String, enum: ["admin", "branch_user"], default: "branch_user" },
  },
  { timestamps: true }
);

const AccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    password: String,
    provider: String,
    providerAccountId: String,
  },
  { timestamps: true }
);

const StoreModel = mongoose.model("Store", StoreSchema);
const BranchModel = mongoose.model("Branch", BranchSchema);
const UserModel = mongoose.model("User", UserSchema);
const AccountModel = mongoose.model("Account", AccountSchema);

async function run() {
  await mongoose.connect(MONGODB_URI!);
  console.log("✅ Connected to MongoDB\n");

  // ── Step 1: wipe every collection ──────────────────────────────────────────
  const db = mongoose.connection.db!;
  const allCollections = await db.listCollections().toArray();
  const names = allCollections
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .sort();

  if (names.length === 0) {
    console.log("ℹ️  Database already empty, skipping wipe\n");
  } else {
    console.log(`🗑️  Dropping ${names.length} collection(s)...`);
    for (const name of names) {
      await db.collection(name).drop();
      console.log(`   dropped: ${name}`);
    }
    console.log("");
  }

  // ── Step 2: seed roles ─────────────────────────────────────────────────────
  const rolesCol = db.collection("roles");
  const now = new Date();
  for (const name of ["admin", "branch_user"]) {
    await rolesCol.updateOne(
      { name },
      { $setOnInsert: { name, createdAt: now, updatedAt: now } },
      { upsert: true }
    );
  }
  console.log("✅ Seeded roles: admin, branch_user");

  // ── Step 3: test store ─────────────────────────────────────────────────────
  const store = await StoreModel.create({
    name: "Test Store (Playwright)",
    userId: new mongoose.Types.ObjectId(),
  });
  console.log(`✅ Created store:  ${store._id}`);

  // ── Step 4: test branch ────────────────────────────────────────────────────
  const branch = await BranchModel.create({
    name: "Test Branch",
    storeId: store._id,
    location: "Test City",
  });
  console.log(`✅ Created branch: ${branch._id}`);

  // ── Step 5: admin user ─────────────────────────────────────────────────────
  const adminUser = await UserModel.create({
    name: "Test",
    surname: "Admin",
    email: "admin@testbranch.com",
    role: "admin",
    storeId: store._id,
  });
  await AccountModel.create({
    userId: adminUser._id,
    name: "Test Admin",
    password: await bcrypt.hash("Admin@123456", 12),
    provider: "credentials",
    providerAccountId: "admin@testbranch.com",
  });
  console.log(`✅ Created admin:  ${adminUser._id}  (admin@testbranch.com / Admin@123456)`);

  // ── Step 6: branch user ────────────────────────────────────────────────────
  const branchUser = await UserModel.create({
    name: "Test",
    surname: "Branch User",
    email: "branch@testbranch.com",
    role: "branch_user",
    storeId: store._id,
    branchId: branch._id,
  });
  await AccountModel.create({
    userId: branchUser._id,
    name: "Test Branch User",
    password: await bcrypt.hash("Branch@123456", 12),
    provider: "credentials",
    providerAccountId: "branch@testbranch.com",
  });
  console.log(`✅ Created branch user: ${branchUser._id}  (branch@testbranch.com / Branch@123456)`);

  console.log("\n🎉 Reset complete! Copy these into .env.test:\n");
  console.log(`TEST_STORE_ID=${store._id}`);
  console.log(`TEST_BRANCH_ID=${branch._id}`);
  console.log("");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
