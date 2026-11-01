/**
 * Run the despatch-slip reader over every image in a folder and print what it found. Calls the Anthropic
 * API (needs ANTHROPIC_API_KEY in .env.local), so it costs a few cents per image.
 *
 *   npx tsx scripts/try-despatch-extract.ts <folder> [--json]
 *
 * Images are only read as bytes; nothing from the folder is executed.
 */
import * as dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: try-despatch-extract.ts <folder> [--json]");
  const asJson = process.argv.includes("--json");
  const { extractDespatchSlip } = await import("@/lib/ai/extractDespatchSlip");
  const { normaliseSlipLines } = await import("@/lib/pos/despatchLines");

  const files = readdirSync(dir).filter((f) => MIME[path.extname(f).toLowerCase()]).sort();
  const out: unknown[] = [];
  for (const f of files) {
    const started = Date.now();
    try {
      const r = await extractDespatchSlip({ image: readFileSync(path.join(dir, f)), mime: MIME[path.extname(f).toLowerCase()] });
      const { lines, warnings } = normaliseSlipLines(r.items, []);
      const row = { file: f, ms: Date.now() - started, slipNumber: r.slipNumber, customer: r.customerName, currency: r.currency, includesVat: r.pricesIncludeVat, grandTotal: r.grandTotal, lines: lines.length, tokens: [r.inputTokens, r.outputTokens], warnings, items: lines.map((l) => ({ code: l.code, description: l.description, qty: l.quantity, price: l.slipUnitPrice, total: l.slipTotal })) };
      out.push(row);
      if (!asJson) {
        console.log(`\n${f}  (${row.ms} ms, ${r.inputTokens}+${r.outputTokens} tokens)`);
        console.log(`  slip ${r.slipNumber ?? "-"} | customer ${r.customerName ?? "-"} | ${r.currency ?? "no currency"} | VAT ${r.pricesIncludeVat ?? "?"} | grand total ${r.grandTotal ?? "-"} | ${lines.length} lines`);
        for (const l of lines.slice(0, 6)) console.log(`   ${l.code || "-"} | ${l.description} | qty ${l.quantity} | ${l.slipUnitPrice ?? "-"} | ${l.slipTotal ?? "-"}`);
        if (lines.length > 6) console.log(`   … ${lines.length - 6} more`);
        for (const w of warnings) console.log(`  ! ${w}`);
      }
    } catch (e) {
      out.push({ file: f, error: e instanceof Error ? e.message : String(e) });
      if (!asJson) console.log(`\n${f}\n  ERROR ${e instanceof Error ? e.message : e}`);
    }
  }
  if (asJson) console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
