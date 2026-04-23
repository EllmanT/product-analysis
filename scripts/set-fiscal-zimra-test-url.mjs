/**
 * Sets FiscalSettings.zimraApiUrl to the no-auth Axis VD test host (port 10005).
 * Uses the same URI selection as lib/mongoose.ts (OFFLINE_MONGODB_URI when NODE_ENV !== production).
 * Run: node scripts/set-fiscal-zimra-test-url.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const nodeEnv = process.env.NODE_ENV || "development";
let uri = process.env.MONGODB_URI;
if (nodeEnv !== "production") {
  uri = process.env.OFFLINE_MONGODB_URI || uri;
}
if (!uri) {
  console.error("No MONGODB_URI / OFFLINE_MONGODB_URI after loading .env.local");
  process.exit(1);
}

const ZIMRA_TEST = "http://140.82.25.196:10005";

const client = new MongoClient(uri);
await client.connect();
const db = client.db("stockflow");
const col = db.collection("fiscalsettings");
const r = await col.updateMany({}, { $set: { zimraApiUrl: ZIMRA_TEST } });
console.log("fiscalsettings updateMany matched=%s modified=%s", r.matchedCount, r.modifiedCount);
const doc = await col.findOne({}, { projection: { zimraApiUrl: 1 } });
console.log("sample:", doc);
await client.close();
