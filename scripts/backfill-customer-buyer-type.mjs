/**
 * One-time data fix after adding `buyerType` to the shop Customer model:
 * sets `buyerType: "individual"` where missing.
 *
 * Linking legacy bcrypt customers to Clerk: when the user signs in with Clerk using the
 * same email, `getCustomerIdForClerkUser` in `lib/shop/ensure-clerk-customer.ts` sets
 * `clerkUserId` on the existing `Customer` document (no separate migration required).
 *
 * Run from repo root (uses MONGODB_URI; for local dev, OFFLINE_MONGODB_URI is not read here—set
 * MONGODB_URI to your target database):
 *   node --env-file=.env.local scripts/backfill-customer-buyer-type.mjs
 */

import mongoose from "mongoose";

const uri = (process.env.MONGODB_URI ?? "").trim();
if (!uri) {
  console.error("MONGODB_URI is required in the environment.");
  process.exit(1);
}

const result = await mongoose.connect(uri);
const coll = result.connection.db?.collection("customers");
if (!coll) {
  console.error("Could not open customers collection.");
  process.exit(1);
}

const u = await coll.updateMany(
  { buyerType: { $exists: false } },
  { $set: { buyerType: "individual" } }
);
console.log(
  "Matched:",
  u.matchedCount,
  "Modified:",
  u.modifiedCount
);

await mongoose.disconnect();
