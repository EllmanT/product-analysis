/**
 * Seeds ProductMaster from Data.txt (5,337 stock items), matching the same
 * upsert-by-standardCode semantics processStockUpload.ts uses so a later real
 * upload with the same codes won't clobber what this script sets.
 *
 * imageUrl is only populated for the ~117 products that matched a product on
 * electrosales.co.zw with high confidence (exact spec/rating agreement, not
 * just similar wording) - see scripts/data/product-master-seed.json. Medium-
 * confidence matches are intentionally left without an image pending a human
 * visual check, per project decision.
 *
 * Usage (from repo root, with env loaded the same way as Next):
 *   node --env-file=.env.local scripts/seed-product-master-catalog.mjs
 *   node --env-file=.env.local scripts/seed-product-master-catalog.mjs --target=live
 *
 * Requires MONGODB_URI or OFFLINE_MONGODB_URI in the environment.
 * With --target=live, uses MONGODB_URI only (never OFFLINE_MONGODB_URI).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { MongoClient } from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

console.log(`Target: ${targetLive ? "live (MONGODB_URI)" : "offline/test"}\n`);

const seedPath = join(__dirname, "data", "product-master-seed.json");
const items = JSON.parse(readFileSync(seedPath, "utf-8"));
console.log(`Loaded ${items.length} products from ${seedPath}`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db("stockflow");
const col = db.collection("productmasters");

const now = new Date();
const BATCH_SIZE = 500;
let upserted = 0;
let matched = 0;
let withImage = 0;

for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  const ops = batch.map((item) => {
    const setFields = { updatedAt: now };
    if (item.imageUrl) {
      setFields.imageUrl = item.imageUrl;
      withImage++;
    }
    return {
      updateOne: {
        filter: { standardCode: item.code },
        update: {
          $setOnInsert: {
            standardCode: item.code,
            name: item.name,
            isActive: true,
            createdAt: now,
          },
          $set: setFields,
        },
        upsert: true,
      },
    };
  });

  const result = await col.bulkWrite(ops, { ordered: false });
  upserted += result.upsertedCount;
  matched += result.matchedCount;
  console.log(
    `  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}: ` +
      `+${result.upsertedCount} new, ${result.matchedCount} existing updated`
  );
}

console.log(
  `\nDone. ${upserted} new ProductMaster docs inserted, ${matched} existing docs matched/updated. ` +
    `${withImage} products got an imageUrl written (high-confidence electrosales.co.zw matches only).`
);

await client.close();
