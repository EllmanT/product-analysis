import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { Branch, Upload, UploadProduct, User, WeeklyProductSummaries } from "../database";
import { processStockUpload } from "../lib/upload/processStockUpload";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const TEST_FILES = [
  "week01.txt",
  "week02.txt",
  "week03.txt",
  "week04.txt",
  "week05_restock.txt",
  "week06.txt",
  "week07.txt",
  "week08.txt",
  "week09_restock.txt",
  "week10.txt",
];

type CliArgs = {
  storeId?: string;
  branchId?: string;
  userId?: string;
  email?: string;
  months?: number;
  days?: number;
  clear: boolean;
  dryRun: boolean;
};

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { clear: true, dryRun: false };

  for (const arg of args) {
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--no-clear") result.clear = false;
    else if (arg === "--clear") result.clear = true;
    else if (arg.startsWith("--months=")) {
      const parsed = Number(arg.split("=")[1]);
      if (Number.isFinite(parsed) && parsed > 0) result.months = parsed;
    } else if (arg.startsWith("--days=")) {
      const parsed = Number(arg.split("=")[1]);
      if (Number.isFinite(parsed) && parsed > 0) result.days = parsed;
    }
    else if (arg.startsWith("--storeId=")) result.storeId = arg.split("=")[1];
    else if (arg.startsWith("--branchId=")) result.branchId = arg.split("=")[1];
    else if (arg.startsWith("--userId=")) result.userId = arg.split("=")[1];
    else if (arg.startsWith("--email=")) result.email = arg.split("=")[1];
  }

  return result;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function resolveIds(args: CliArgs): Promise<{
  storeId: string;
  branchId: string;
  userId: string;
}> {
  let storeId = args.storeId;
  let branchId = args.branchId;
  let userId = args.userId;

  if (args.email) {
    const user = await User.findOne({ email: args.email }).lean();
    if (!user) {
      throw new Error(`No user found for email: ${args.email}`);
    }
    if (!user.storeId) {
      throw new Error(`User ${args.email} has no storeId assigned`);
    }
    storeId = String(user.storeId);
    userId = String(user._id);
    console.log(`Resolved user ${args.email} → storeId=${storeId}, userId=${userId}`);
  }

  if (!storeId) {
    throw new Error("storeId is required (use --storeId=... or --email=...)");
  }

  if (!userId) {
    const admin = await User.findOne({ storeId, role: "admin" }).lean();
    if (!admin) {
      throw new Error(
        "userId is required (use --userId=... or --email=...) — no admin found for store"
      );
    }
    userId = String(admin._id);
    console.log(`Using admin userId=${userId}`);
  }

  if (!branchId) {
    const branches = await Branch.find({ storeId }).lean();
    if (branches.length === 0) {
      throw new Error(`No branches found for store ${storeId}`);
    }
    if (branches.length > 1) {
      throw new Error(
        `Store has ${branches.length} branches — pass --branchId=... (available: ${branches.map((b) => `${b.name}=${b._id}`).join(", ")})`
      );
    }
    branchId = String(branches[0]._id);
    console.log(`Auto-selected branch: ${branches[0].name} (${branchId})`);
  }

  const branch = await Branch.findOne({ _id: branchId, storeId });
  if (!branch) {
    throw new Error(`Branch ${branchId} not found for store ${storeId}`);
  }

  return { storeId, branchId, userId };
}

async function clearStoreUploadData(storeId: string): Promise<void> {
  const storeOid = new mongoose.Types.ObjectId(storeId);

  const [u, up, ws] = await Promise.all([
    Upload.deleteMany({ storeId: storeOid }),
    UploadProduct.deleteMany({ storeId: storeOid }),
    WeeklyProductSummaries.deleteMany({ storeId: storeOid }),
  ]);

  console.log(
    `Cleared store ${storeId}: ${u.deletedCount} uploads, ${up.deletedCount} upload products, ${ws.deletedCount} weekly summaries`
  );
}

async function main() {
  const args = parseArgs();
  const RAW_URI = process.env.OFFLINE_MONGODB_URI || process.env.MONGODB_URI;
  const MONGODB_URI = RAW_URI?.replace(/\/?$/, "/stockflow");

  if (!MONGODB_URI) {
    console.error("MONGODB_URI or OFFLINE_MONGODB_URI required in .env.local");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const { storeId, branchId, userId } = await resolveIds(args);
  const testDataDir = path.join(process.cwd(), "test-data");
  const endDate = new Date();
  endDate.setHours(12, 0, 0, 0);

  const requestedDays = args.days ?? (() => {
    const months = args.months ?? 2;
    const start = new Date(endDate);
    start.setMonth(start.getMonth() - months);
    const diffMs = endDate.getTime() - start.getTime();
    return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
  })();

  const startDate = addDays(endDate, -(requestedDays - 1));

  const schedule = Array.from({ length: requestedDays }, (_, index) => ({
    file: TEST_FILES[index % TEST_FILES.length],
    uploadDate: addDays(startDate, index),
  }));

  console.log(
    `Simulation plan (daily interval from ${formatDate(startDate)} to ${formatDate(endDate)}):\n`
  );
  schedule.forEach((item, i) => {
    console.log(`  ${i + 1}. ${formatDate(item.uploadDate)}  ${item.file}`);
  });
  console.log("");

  if (args.dryRun) {
    console.log("Dry run — no changes made.");
    await mongoose.disconnect();
    return;
  }

  if (args.clear) {
    await clearStoreUploadData(storeId);
    console.log("");
  }

  type RowResult = {
    day: number;
    date: string;
    file: string;
    deadStockSkus: number;
    restocked: string;
    cumulative: number;
    status: string;
  };

  const results: RowResult[] = [];
  let cumulative = 0;

  for (let i = 0; i < schedule.length; i++) {
    const { file, uploadDate } = schedule[i];
    const filePath = path.join(testDataDir, file);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Test file not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    const timestamp = uploadDate.toISOString().replace(/[:.]/g, "-");
    const fileName = `simulate_${timestamp}_${file}`;

    console.log(`Uploading ${file} as ${formatDate(uploadDate)}...`);

    const result = await processStockUpload({
      buffer: arrayBuffer,
      fileName,
      originalFileName: file,
      fileSizeBytes: buffer.byteLength,
      userId,
      storeId,
      branchId,
      uploadDate,
    });

    if (result.duplicate) {
      results.push({
        day: i + 1,
        date: formatDate(uploadDate),
        file,
        deadStockSkus: 0,
        restocked: "—",
        cumulative,
        status: "DUPLICATE (skipped)",
      });
      console.warn(`  Duplicate detected for ${file} on ${formatDate(uploadDate)}`);
      continue;
    }

    cumulative += 1;
    results.push({
      day: i + 1,
      date: formatDate(uploadDate),
      file,
      deadStockSkus: result.summary.deadStockSkus,
      restocked: result.restockedCodes.length
        ? result.restockedCodes.join(", ")
        : "—",
      cumulative,
      status: "OK",
    });

    console.log(
      `  OK — ${result.summary.productLineCount} products, ${result.summary.deadStockSkus} dead stock` +
        (result.restockedCodes.length
          ? `, restocked: ${result.restockedCodes.join(", ")}`
          : "")
    );
  }

  console.log("\n--- Results ---\n");
  console.log(
    "Day | Date       | File               | Dead | Restocks              | Total uploads"
  );
  console.log(
    "----|------------|--------------------|------|-----------------------|--------------"
  );
  for (const r of results) {
    console.log(
      `${String(r.day).padStart(3)} | ${r.date} | ${r.file.padEnd(18)} | ${String(r.deadStockSkus).padStart(4)} | ${r.restocked.padEnd(21)} | ${r.cumulative}`
    );
  }

  console.log("\n--- Expected seeded behavior ---");
  console.log("Data now spans a continuous daily period using repeating week01..week10 fixtures.");
  console.log("You should see realistic variation when switching between Day, Week, and Month views.");
  console.log("\nVerify in app:");
  console.log(`  /dashboard          — ${requestedDays} uploads, estimated sales > 0`);
  console.log(`  /uploads            — dates spanning ${requestedDays} day(s)`);
  console.log("  /branch-analytics   — trend chart with multiple points");
  console.log("  /product-movement   — per-product sales (try FAN001, CASE001)");
  console.log("  /products           — dead/low stock filters");
  console.log("  /ai-agent           — ask about low stock, restocks, zero qty");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
