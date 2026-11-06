import { readFileSync, writeFileSync } from "fs";

const raw = readFileSync(
  "C:\\Users\\Ropafadzo Muridzi\\Documents\\tapiwa projects\\product-analysis\\Data.txt",
  "utf-8"
);

const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

const products = lines.map((line, idx) => {
  const parts = line.split(",");
  const code = (parts[0] || "").trim();
  const description = (parts[1] || "").trim();
  const stockQty = (parts[2] || "").trim();
  const price = (parts[3] || "").trim();
  const col5 = (parts[4] || "").trim();
  const flag = (parts[5] || "").trim();
  return { line: idx + 1, code, description, stockQty, price, col5, flag };
});

console.log(`Parsed ${products.length} product rows`);

// --- crude keyword-based category clustering ---
const CATEGORY_RULES = [
  ["cable", /\b(CABLE|F\/T|FLAT TWIN|S\/C|EARTH|COAX|WIRE)\b/i],
  ["capacitor", /\bCAPACITOR|CUF\b/i],
  ["plug_socket", /\bPLUG(TOP)?\b|SOCKET|ADAPTOR|MULTI ADAPTOR/i],
  ["lock_security", /\bLOCK|PADLOCK|GATE\b|GEM SET/i],
  ["lighting", /\bLIGHT|BULB|LAMP|LED|STRIP LIGHT|FLOOD/i],
  ["tools", /\bTOOL|PLIERS|FILE|WRENCH|SCREWDRIVER|GLOVES|TAPE MEASURE|CALIPER/i],
  ["pumps_water", /\bPUMP|FLOAT SWITCH|IMMERSION/i],
  ["solar", /\bSOLAR|RGB|RECHARGABLE/i],
  ["breakers_distribution", /\bMCB|BREAKER|DB BOARD|NEUTRAL BAR|METER\b/i],
  ["glands_ferrules", /\bGLAND|FERULE|FERRULE/i],
  ["pipes_conduit", /\bPIPE|CONDUIT|TRUNKING/i],
  ["welding", /\bWELD/i],
  ["fuses", /\bFUSE\b/i],
  ["poles_towers", /\bPOLE\b/i],
];

function categorize(desc) {
  for (const [name, re] of CATEGORY_RULES) {
    if (re.test(desc)) return name;
  }
  return "uncategorized";
}

const byCategory = {};
for (const p of products) {
  const cat = categorize(p.description);
  p.category = cat;
  (byCategory[cat] ??= []).push(p);
}

const summary = Object.entries(byCategory)
  .map(([cat, items]) => ({ cat, count: items.length }))
  .sort((a, b) => b.count - a.count);

console.log("Category breakdown:");
for (const s of summary) console.log(`  ${s.cat}: ${s.count}`);

writeFileSync(
  new URL("./products-all.json", import.meta.url),
  JSON.stringify(products, null, 2)
);

// --- stratified sample of ~150, proportional but with a floor per category ---
const TARGET = 150;
const totalCount = products.length;
const sample = [];
for (const [cat, items] of Object.entries(byCategory)) {
  const proportional = Math.round((items.length / totalCount) * TARGET);
  const n = Math.max(Math.min(items.length, 4), proportional); // floor of 4 per category if available
  // spread picks across the list rather than just the first N
  const step = Math.max(1, Math.floor(items.length / n));
  for (let i = 0; i < items.length && sample.length < TARGET * 1.3; i += step) {
    sample.push(items[i]);
  }
}

// trim/pad to ~150
const finalSample = sample.slice(0, 160);
console.log(`\nSample size: ${finalSample.length}`);
writeFileSync(
  new URL("./sample-150.json", import.meta.url),
  JSON.stringify(finalSample, null, 2)
);
