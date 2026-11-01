/**
 * Score the despatch-slip reader against slips whose true contents are known.
 * Calls the Anthropic API (ANTHROPIC_API_KEY in .env.local), a few cents per slip.
 *
 *   npx tsx scripts/eval-despatch-extract.ts [fixturesDir] [--min 0.9]
 *
 * fixturesDir holds img/*.jpg and truth.json (see generate-despatch-fixtures.ts). Exit code 1 when the
 * share of correct item fields falls below --min (default 0.9).
 */
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type TruthItem = { code: string | null; description: string; qty: number; unit_price: number | null; total: number | null };
type Truth = { slipNumber: string | null; currency: string | null; pricesIncludeVat: boolean | null; grandTotal: number | null; items: TruthItem[] };

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9.]+/g) ?? []).filter(Boolean));
const similar = (a: string, b: string) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.max(A.size, B.size);
};
const near = (a: number | null | undefined, b: number | null | undefined) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.011);

async function main() {
  const args = process.argv.slice(2);
  const minIdx = args.indexOf("--min");
  const min = minIdx >= 0 ? Number(args[minIdx + 1]) : 0.9;
  const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--min") ?? path.join("scripts", "despatch-fixtures");
  const truth = JSON.parse(readFileSync(path.join(dir, "truth.json"), "utf8")) as Record<string, Truth>;
  const { extractDespatchSlip } = await import("@/lib/ai/extractDespatchSlip");

  let fieldsOk = 0;
  let fieldsAll = 0;
  let linesOk = 0;
  let linesAll = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  const problems: string[] = [];

  for (const [file, t] of Object.entries(truth)) {
    const started = Date.now();
    let r;
    try {
      r = await extractDespatchSlip({ image: readFileSync(path.join(dir, "img", file)), mime: "image/jpeg" });
    } catch (e) {
      console.log(`${file.padEnd(40)} ERROR ${e instanceof Error ? e.message : e}`);
      fieldsAll += t.items.length * 4;
      linesAll += t.items.length;
      problems.push(`${file}: extraction failed`);
      continue;
    }
    tokensIn += r.inputTokens;
    tokensOut += r.outputTokens;

    const pool = r.items.map((it, i) => ({ it, i, used: false }));
    let slipFields = 0;
    let slipOk = 0;
    let slipLines = 0;
    for (const want of t.items) {
      // Match by code first, then by description words.
      let m = want.code ? pool.find((p) => !p.used && norm(p.it.code) === norm(want.code)) : undefined;
      if (!m) {
        let best = 0;
        for (const p of pool) {
          if (p.used) continue;
          const s = similar(want.description, p.it.description ?? "");
          if (s > best && s >= 0.6) {
            best = s;
            m = p;
          }
        }
      }
      slipFields += 4;
      if (!m) {
        problems.push(`${file}: line not found "${want.description}"`);
        continue;
      }
      m.used = true;
      const got = m.it;
      const checks: [string, boolean, unknown, unknown][] = [
        ["code", want.code === null || norm(got.code) === norm(want.code), got.code, want.code],
        ["qty", near(got.qty, want.qty), got.qty, want.qty],
        ["price", want.unit_price === null || near(got.unit_price, want.unit_price), got.unit_price, want.unit_price],
        ["total", want.total === null || near(got.total, want.total), got.total, want.total],
      ];
      let lineOk = true;
      for (const [name, ok, g, w] of checks) {
        if (ok) slipOk++;
        else {
          lineOk = false;
          problems.push(`${file}: "${want.description}" ${name} read ${JSON.stringify(g)} expected ${JSON.stringify(w)}`);
        }
      }
      if (lineOk) slipLines++;
    }
    const extra = pool.filter((p) => !p.used).length;
    if (extra) problems.push(`${file}: ${extra} extra line(s) read that are not on the slip`);
    fieldsOk += slipOk;
    fieldsAll += slipFields;
    linesOk += slipLines;
    linesAll += t.items.length;

    const meta = [
      `slip#${norm(r.slipNumber) === norm(t.slipNumber) ? "ok" : `x(${r.slipNumber})`}`,
      `total${t.grandTotal === null ? "-" : near(r.grandTotal, t.grandTotal) ? "ok" : `x(${r.grandTotal})`}`,
      `vat${t.pricesIncludeVat === null ? "-" : r.pricesIncludeVat === t.pricesIncludeVat ? "ok" : `x(${r.pricesIncludeVat})`}`,
      `ccy${t.currency === null ? "-" : r.currency === t.currency ? "ok" : `x(${r.currency})`}`,
    ].join(" ");
    console.log(`${file.padEnd(40)} lines ${slipLines}/${t.items.length}  fields ${slipOk}/${slipFields}  ${meta}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  console.log(`\nLines fully right: ${linesOk}/${linesAll}   Item fields right: ${fieldsOk}/${fieldsAll} (${((100 * fieldsOk) / fieldsAll).toFixed(1)}%)   Tokens: ${tokensIn} in / ${tokensOut} out`);
  if (problems.length) console.log(`\nProblems:\n  ${problems.join("\n  ")}`);
  if (fieldsOk / fieldsAll < min) {
    console.error(`\nBelow the ${(min * 100).toFixed(0)}% bar`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
