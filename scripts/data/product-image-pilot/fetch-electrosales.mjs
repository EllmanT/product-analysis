import { writeFileSync } from "fs";

const DEPARTMENTS = ["electrical", "tools", "plumbing", "building", "automotive", "garden"];
const BASE = "https://www.electrosales.co.zw:3000/shop/getProductsList";
const LIMIT = 200;

async function fetchDept(dept) {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const url = `${BASE}?category=${encodeURIComponent(dept)}&limit=${LIMIT}&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 product-image-research" } });
    if (!res.ok) {
      console.log(`  ${dept} page ${page}: HTTP ${res.status}, stopping`);
      break;
    }
    const data = await res.json();
    pages = data.pages || 1;
    all.push(...data.items);
    console.log(`  ${dept} page ${page}/${pages}: +${data.items.length} (running total ${all.length})`);
    page++;
    // gentle pacing between requests
    await new Promise((r) => setTimeout(r, 400));
  } while (page <= pages);
  return all;
}

const combined = [];
for (const dept of DEPARTMENTS) {
  console.log(`Fetching department: ${dept}`);
  const items = await fetchDept(dept);
  for (const it of items) it._department = dept;
  combined.push(...items);
}

// de-dupe by id
const seen = new Set();
const deduped = combined.filter((p) => {
  if (seen.has(p.id)) return false;
  seen.add(p.id);
  return true;
});

console.log(`\nTotal raw: ${combined.length}, deduped: ${deduped.length}`);
writeFileSync(new URL("./electrosales-catalog.json", import.meta.url), JSON.stringify(deduped, null, 2));
