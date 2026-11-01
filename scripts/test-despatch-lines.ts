/**
 * Despatch-slip line clean-up and catalogue matching.
 *   npx tsx scripts/test-despatch-lines.ts
 */
import { DESPATCH_DEFAULT_HS_CODE, normaliseSlipLines, slipNumberKey, sumSlipTotals } from "../lib/pos/despatchLines";

const products = [
  { id: "p1", name: "LED Bulb 9W", code: "LB09", hsCode: "85395000", priceUsd: 2, priceZwg: null, priceOnEntry: false },
  { id: "p2", name: "Conduit Pipe 20mm", code: "CP20", hsCode: "39172100", priceUsd: 1.5, priceZwg: null, priceOnEntry: false },
];

let bad = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) bad++;
};

const { lines, warnings } = normaliseSlipLines(
  [
    { code: "lb09", description: " LED  Bulb 9W ", qty: 10, unit_price: 2, total: 20 },
    { code: "", description: "conduit pipe", qty: 3.12345, unit_price: 1.5, total: 4.68 },
    { code: "ZZ99", description: "Mystery item", qty: 1, unit_price: 5.555, total: 9 },
    { code: null, description: null, qty: null, unit_price: null, total: null },
    { code: "X1", description: "No qty", qty: null, unit_price: 0, total: null },
  ],
  products
);

check("empty row is skipped", lines.length === 4);
check("code match is case-insensitive and exact", lines[0].matchKind === "exact" && lines[0].productId === "p1");
check("description whitespace is collapsed", lines[0].description === "LED Bulb 9W");
check("name-only match is only a suggestion", lines[1].matchKind === "suggested" && lines[1].productId === "p2");
check("quantity is rounded to 3 dp and flagged", lines[1].quantity === 3.123 && lines[1].issues.some((i) => /rounded/.test(i)));
check("unmatched line gets the default HS code", lines[2].matchKind === "none" && lines[2].hsCode === DESPATCH_DEFAULT_HS_CODE);
check("total that is not qty x price is flagged", lines[2].issues.some((i) => /does not equal/.test(i)));
check("missing quantity and zero price are flagged, not dropped", lines[3].quantity === 0 && lines[3].issues.length >= 2);
check("line numbers are consecutive", lines.map((l) => l.lineNo).join() === "1,2,3,4");
check("sumSlipTotals is null when a total is missing", sumSlipTotals(lines) === null);
check("sumSlipTotals adds slip totals", sumSlipTotals(lines.slice(0, 3)) === 33.68);
check("no warnings for a normal slip", warnings.length === 0);
check("empty slip warns", normaliseSlipLines([], products).warnings.length === 1);
check("slip number key ignores case and punctuation", slipNumberKey("DS-0012") === slipNumberKey(" ds 0012 ") && slipNumberKey("--") === undefined);

if (bad) process.exit(1);
console.log("All checks passed");
