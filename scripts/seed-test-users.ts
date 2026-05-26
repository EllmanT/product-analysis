import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const RAW_URI = process.env.OFFLINE_MONGODB_URI || process.env.MONGODB_URI;
const MONGODB_URI = RAW_URI?.replace(/\/?$/, "/stockflow");

if (!MONGODB_URI) {
  console.error("❌ OFFLINE_MONGODB_URI not set in .env.local");
  process.exit(1);
}

const StoreSchema = new mongoose.Schema({
  name: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

const BranchSchema = new mongoose.Schema({
  name: String,
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
  location: String,
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  name: String,
  surname: String,
  email: { type: String, unique: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
  role: { type: String, enum: ["admin", "branch_user"], default: "branch_user" },
}, { timestamps: true });

const AccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  password: String,
  provider: String,
  providerAccountId: String,
}, { timestamps: true });

const StoreModel = mongoose.models.Store || mongoose.model("Store", StoreSchema);
const BranchModel = mongoose.models.Branch || mongoose.model("Branch", BranchSchema);
const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);
const AccountModel = mongoose.models.Account || mongoose.model("Account", AccountSchema);

async function seed() {
  await mongoose.connect(MONGODB_URI!);
  console.log("✅ Connected to MongoDB");

  let adminUser = await UserModel.findOne({ email: "admin@testbranch.com" });

  let store = await StoreModel.findOne({ name: "Test Store (Playwright)" });
  if (!store) {
    const placeholderUserId = new mongoose.Types.ObjectId();
    store = await StoreModel.create({ name: "Test Store (Playwright)", userId: placeholderUserId });
    console.log(`✅ Created store: ${store._id}`);
  } else {
    console.log(`ℹ️  Store already exists: ${store._id}`);
  }

  let branch = await BranchModel.findOne({ name: "Test Branch", storeId: store._id });
  if (!branch) {
    branch = await BranchModel.create({
      name: "Test Branch",
      storeId: store._id,
      location: "Test City",
    });
    console.log(`✅ Created branch: ${branch._id}`);
  } else {
    console.log(`ℹ️  Branch already exists: ${branch._id}`);
  }

  const hashedAdminPassword = await bcrypt.hash("Admin@123456", 12);
  if (!adminUser) {
    adminUser = await UserModel.create({
      name: "Test",
      surname: "Admin",
      email: "admin@testbranch.com",
      role: "admin",
      storeId: store._id,
    });
    await AccountModel.create({
      userId: adminUser._id,
      name: "Test Admin",
      password: hashedAdminPassword,
      provider: "credentials",
      providerAccountId: "admin@testbranch.com",
    });
    console.log(`✅ Created admin user: ${adminUser._id}`);
  } else {
    await AccountModel.findOneAndUpdate(
      { userId: adminUser._id },
      { password: hashedAdminPassword, providerAccountId: "admin@testbranch.com" },
      { upsert: true }
    );
    console.log(`ℹ️  Admin user already exists, password refreshed`);
  }

  const hashedBranchPassword = await bcrypt.hash("Branch@123456", 12);
  let branchUser = await UserModel.findOne({ email: "branch@testbranch.com" });
  if (!branchUser) {
    branchUser = await UserModel.create({
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
      password: hashedBranchPassword,
      provider: "credentials",
      providerAccountId: "branch@testbranch.com",
    });
    console.log(`✅ Created branch user: ${branchUser._id}`);
  } else {
    await AccountModel.findOneAndUpdate(
      { userId: branchUser._id },
      { password: hashedBranchPassword, providerAccountId: "branch@testbranch.com" },
      { upsert: true }
    );
    console.log(`ℹ️  Branch user already exists, password refreshed`);
  }

  console.log("\n🎉 Seed complete! Copy these into .env.test:\n");
  console.log(`TEST_STORE_ID=${store._id}`);
  console.log(`TEST_BRANCH_ID=${branch._id}`);
  console.log("");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
