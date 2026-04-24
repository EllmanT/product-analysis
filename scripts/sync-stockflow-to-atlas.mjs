/**
 * Copy the `stockflow` database from a source Mongo (e.g. local / Compass) to a
 * target (e.g. Atlas). Uses the `mongodb` driver (same family as the app).
 *
 * Env (required; use either pair):
 *   STOCKFLOW_SOURCE_URI  — local connection string (e.g. mongodb://127.0.0.1:27017/...)
 *   STOCKFLOW_TARGET_URI  — Atlas (or other) connection string; database name in URI is
 *                           ignored — `stockflow` is always used (matches app lib/mongoose.ts).
 *   If those are unset, the script falls back to OFFLINE_MONGODB_URI (source) and MONGODB_URI
 *   (target), so a typical .env.local with only those two (Compass + Atlas) is enough.
 *
 * Optional flags:
 *   --dry-run                    List collections and source document counts; no writes.
 *   --allow-non-empty-target     Proceed even if the target `stockflow` has data (overwrites
 *                                 only per copied collection; use with care). Without this
 *                                 flag, the script exits if any target collection is non-empty.
 *
 * Run (Node 20+), from repo root:
 *   node --env-file=.env.local scripts/sync-stockflow-to-atlas.mjs
 * (add STOCKFLOW_SOURCE_URI and STOCKFLOW_TARGET_URI to .env.local, or set them in the shell.)
 *
 * Index limitation: this script copies documents only. For full index fidelity (and fastest
 * large dumps), prefer MongoDB Database Tools:
 *
 *   mongodump  --uri="SOURCE_URI" --db=stockflow --out=./dump-stockflow
 *   mongorestore --uri="TARGET_URI" --db=stockflow --drop ./dump-stockflow/stockflow
 *
 * (Install from https://www.mongodb.com/try/download/database-tools )
 * `--drop` drops target collections in `stockflow` before restore; omit if you need stricter safety.
 */
import { MongoClient } from "mongodb";

const DB_NAME = "stockflow";
const BATCH_SIZE = 800;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allowNonEmptyTarget = args.includes("--allow-non-empty-target");

const sourceUri = (
  process.env.STOCKFLOW_SOURCE_URI ||
  process.env.OFFLINE_MONGODB_URI ||
  ""
).trim();
const targetUri = (
  process.env.STOCKFLOW_TARGET_URI || process.env.MONGODB_URI || ""
).trim();

if (!sourceUri) {
  console.error(
    "Set STOCKFLOW_SOURCE_URI or OFFLINE_MONGODB_URI (local Mongo) in the environment."
  );
  process.exit(1);
}
if (!targetUri) {
  console.error(
    "Set STOCKFLOW_TARGET_URI or MONGODB_URI (e.g. Atlas) in the environment."
  );
  process.exit(1);
}
if (sourceUri === targetUri) {
  console.error("Source and target URIs must be different (local vs Atlas).");
  process.exit(1);
}

const sourceClient = new MongoClient(sourceUri);
const targetClient = new MongoClient(targetUri);

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

/**
 * @param {import("mongodb").Db} targetDb
 * @param {string[]} sourceNames
 */
async function assertTargetEmptyOrAllowed(targetDb, sourceNames) {
  const allTarget = await listUserCollectionNames(targetDb);
  const toCheck = new Set([...allTarget, ...sourceNames]);
  for (const name of toCheck) {
    const n = await targetDb.collection(name).countDocuments();
    if (n > 0) {
      if (!allowNonEmptyTarget) {
        console.error(
          `Refusing to copy: target collection "${name}" has ${n} document(s). ` +
            `The target is expected to be empty. ` +
            `To override, run with --allow-non-empty-target (clears each source collection on the target, then copies).`
        );
        process.exit(1);
      }
    }
  }
}

/**
 * @param {import("mongodb").Collection} sourceCol
 * @param {import("mongodb").Collection} targetCol
 * @param {string} name
 */
async function copyCollectionBatched(sourceCol, targetCol, name) {
  const total = await sourceCol.countDocuments();
  if (total === 0) {
    console.log(`  ${name}: 0 documents (skip)`);
    return;
  }

  let copied = 0;
  const cursor = sourceCol.find({}).batchSize(BATCH_SIZE);
  let batch = [];
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      await targetCol.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await targetCol.insertMany(batch, { ordered: false });
    copied += batch.length;
  }

  if (copied !== total) {
    console.warn(`  ${name}: expected ${total} document(s) but processed ${copied}`);
  } else {
    console.log(`  ${name}: copied ${copied} document(s)`);
  }
}

try {
  await sourceClient.connect();
  await targetClient.connect();

  const sourceDb = sourceClient.db(DB_NAME);
  const targetDb = targetClient.db(DB_NAME);

  const collectionNames = await listUserCollectionNames(sourceDb);
  if (collectionNames.length === 0) {
    console.log(`No user collections in source database "${DB_NAME}". Nothing to do.`);
    process.exit(0);
  }

  if (!allowNonEmptyTarget) {
    await assertTargetEmptyOrAllowed(targetDb, collectionNames);
  } else {
    console.warn("Warning: --allow-non-empty-target: target may already contain data.");
  }

  console.log(
    dryRun
      ? `Dry-run: source "${DB_NAME}" → target "${DB_NAME}" (no writes).`
      : `Copying source "${DB_NAME}" → target "${DB_NAME}"...`
  );

  for (const name of collectionNames) {
    const count = await sourceDb.collection(name).countDocuments();
    if (dryRun) {
      console.log(`  ${name}: ${count} document(s) (dry-run)`);
      continue;
    }

    if (allowNonEmptyTarget) {
      await targetDb.collection(name).deleteMany({});
    }

    await copyCollectionBatched(
      sourceDb.collection(name),
      targetDb.collection(name),
      name
    );
  }

  console.log(dryRun ? "Dry-run done." : "Done.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sourceClient.close().catch(() => {});
  await targetClient.close().catch(() => {});
}
