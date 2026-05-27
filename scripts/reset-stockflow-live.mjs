/**
 * Wipe the live `stockflow` database (Atlas / production MONGODB_URI only).
 *
 * Default: dry-run — lists collections and document counts, no writes.
 * Destructive: pass --confirm-live-reset (drops the entire `stockflow` database).
 *
 * Env:
 *   MONGODB_URI          — required; must NOT fall back to OFFLINE_MONGODB_URI
 *   ATLAS_CLUSTER_HOST   — optional; if set, URI hostname must include this fragment
 *
 * Flags:
 *   --dry-run                 — list only (default when --confirm-live-reset is absent)
 *   --confirm-live-reset      — drop database `stockflow` on MONGODB_URI
 *   --allow-local             — allow 127.0.0.1 / localhost URIs (normally refused)
 *
 * Run (Node 20+), from repo root:
 *   node --env-file=.env.local scripts/reset-stockflow-live.mjs
 *   node --env-file=.env.local scripts/reset-stockflow-live.mjs --confirm-live-reset
 */
import { MongoClient } from "mongodb";

const DB_NAME = "stockflow";

const args = process.argv.slice(2);
const confirmLiveReset = args.includes("--confirm-live-reset");
const allowLocal = args.includes("--allow-local");
const dryRun = !confirmLiveReset || args.includes("--dry-run");

const uri = (process.env.MONGODB_URI ?? "").trim();

if (!uri) {
  console.error(
    "MONGODB_URI is not set. This script only targets the live/production URI."
  );
  process.exit(1);
}

if (process.env.OFFLINE_MONGODB_URI?.trim() === uri) {
  console.warn(
    "Warning: MONGODB_URI equals OFFLINE_MONGODB_URI. Ensure MONGODB_URI is your Atlas/production cluster."
  );
}

const LOCAL_PATTERNS = [/127\.0\.0\.1/i, /localhost/i];
if (!allowLocal && LOCAL_PATTERNS.some((re) => re.test(uri))) {
  console.error(
    "Refusing to reset: MONGODB_URI looks like localhost. " +
      "Use your Atlas URI in MONGODB_URI, or pass --allow-local if intentional."
  );
  process.exit(1);
}

const atlasHostFragment = (process.env.ATLAS_CLUSTER_HOST ?? "").trim();
if (atlasHostFragment) {
  try {
    const hostname = new URL(
      uri.replace(/^mongodb(\+srv)?:\/\//, "https://")
    ).hostname;
    if (!hostname.includes(atlasHostFragment)) {
      console.error(
        `Refusing to reset: URI hostname "${hostname}" does not include ATLAS_CLUSTER_HOST="${atlasHostFragment}".`
      );
      process.exit(1);
    }
  } catch {
    console.warn(
      "Could not parse MONGODB_URI hostname for ATLAS_CLUSTER_HOST check; continuing."
    );
  }
}

/**
 * @param {import("mongodb").Db} db
 * @returns {Promise<string[]>}
 */
async function listUserCollectionNames(db) {
  const all = await db.listCollections().toArray();
  return all
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(DB_NAME);
  const names = await listUserCollectionNames(db);

  console.log(`Database: ${DB_NAME}`);
  console.log(
    dryRun
      ? "Mode: dry-run (no changes). Pass --confirm-live-reset to wipe."
      : "Mode: DESTRUCTIVE — will drop the entire database."
  );
  console.log("");

  if (names.length === 0) {
    console.log("No user collections found. Database is already empty.");
    process.exit(0);
  }

  let totalDocs = 0;
  for (const name of names) {
    const count = await db.collection(name).countDocuments();
    totalDocs += count;
    console.log(`  ${name}: ${count} document(s)`);
  }
  console.log("");
  console.log(`Collections: ${names.length}, total documents: ${totalDocs}`);

  if (dryRun) {
    console.log("");
    console.log(
      "Dry-run complete. To wipe this database, run again with --confirm-live-reset"
    );
    process.exit(0);
  }

  console.log("");
  console.log(`Dropping database "${DB_NAME}"...`);
  await db.dropDatabase();
  console.log(`Done. Database "${DB_NAME}" has been dropped.`);
  console.log("Next: npm run seed:test:live && npm run seed:roles:live");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
