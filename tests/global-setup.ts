import * as dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

// Load .env.local so MONGODB_URI is available (playwright.config only loads .env.test)
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

export default async function globalSetup() {
  const branchId = process.env.TEST_BRANCH_ID;
  if (!branchId) {
    console.warn("[setup] TEST_BRANCH_ID not set — skipping upload cleanup");
    return;
  }

  const RAW_URI = process.env.OFFLINE_MONGODB_URI || process.env.MONGODB_URI;
  const MONGODB_URI = RAW_URI?.replace(/\/?$/, "/stockflow");

  if (!MONGODB_URI) {
    console.warn("[setup] No MONGODB_URI — skipping upload cleanup");
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db!;
    const oid = new mongoose.Types.ObjectId(branchId);

    const [u, up, ws] = await Promise.all([
      db.collection("uploads").deleteMany({ branchId: oid }),
      db.collection("uploadproducts").deleteMany({ branchId: oid }),
      db.collection("weeklyproductsummaries").deleteMany({ branchId: oid }),
    ]);

    console.log(
      `[setup] Cleared test branch: ${u.deletedCount} uploads, ${up.deletedCount} products, ${ws.deletedCount} weekly summaries`
    );
  } catch (err) {
    console.warn("[setup] Could not clear test uploads (continuing anyway):", err);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}
