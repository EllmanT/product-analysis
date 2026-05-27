/**
 * Optional: inserts display-only role names into the `roles` collection.
 * Authorization still uses User.role (admin | branch_user), not this collection.
 *
 * Usage (from repo root, with env loaded the same way as Next):
 *   node --env-file=.env.local scripts/seed-roles.mjs
 *   node --env-file=.env.local scripts/seed-roles.mjs --target=live
 *
 * Requires MONGODB_URI or OFFLINE_MONGODB_URI in the environment.
 * With --target=live, uses MONGODB_URI only (never OFFLINE_MONGODB_URI).
 */
import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const targetLive = args.includes("--target=live");

const uri = targetLive
  ? (process.env.MONGODB_URI ?? "").trim()
  : (process.env.MONGODB_URI || process.env.OFFLINE_MONGODB_URI || "").trim();

if (!uri) {
  if (targetLive) {
    console.error("Set MONGODB_URI for --target=live");
  } else {
    console.error("Set MONGODB_URI or OFFLINE_MONGODB_URI");
  }
  process.exit(1);
}

if (targetLive) {
  console.log("Target: live (MONGODB_URI only)\n");
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db("stockflow");
const col = db.collection("roles");
const now = new Date();

for (const name of ["admin", "branch_user"]) {
  await col.updateOne(
    { name },
    { $setOnInsert: { name, createdAt: now, updatedAt: now } },
    { upsert: true }
  );
}

console.log("Seeded roles collection:", ["admin", "branch_user"]);
await client.close();
