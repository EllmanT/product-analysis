/**
 * Optional: inserts display-only role names into the `roles` collection.
 * Authorization still uses User.role (admin | branch_user), not this collection.
 *
 * Usage (from repo root, with env loaded the same way as Next):
 *   node scripts/seed-roles.mjs
 *
 * Requires MONGODB_URI or OFFLINE_MONGODB_URI in the environment.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.OFFLINE_MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI or OFFLINE_MONGODB_URI");
  process.exit(1);
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
