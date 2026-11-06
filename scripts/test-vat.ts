/**
 * VAT per line must equal the exact value (half away from zero), which is what ZIMRA and the fiscal service work out.
 *   npx tsx scripts/test-vat.ts
 */
import { vatOnLine } from "../lib/utils/invoiceCalculations";

let bad = 0;
let oldWrong = 0;
for (const pct of [15.5, 15, 14.5, 5, 0]) {
  const bp = BigInt(Math.round(pct * 100));
  for (const incl of [false, true]) {
    for (let cents = 1; cents <= 30000; cents++) {
      const num = BigInt(cents) * bp;
      const den = incl ? 10000n + bp : 10000n;
      const exact = Number((2n * num + den) / (2n * den)) / 100; // half up on a positive value
      const got = vatOnLine(cents / 100, pct, incl);
      if (got !== exact) bad++;
      const total = cents / 100;
      const old = pct > 0 ? (incl ? Math.round((total - total / (1 + pct / 100)) * 100) / 100 : Math.round(total * (pct / 100) * 100) / 100) : 0;
      if (old !== exact) oldWrong++;
    }
  }
}
console.log(`new calculation differs from exact: ${bad}; the old float one differed ${oldWrong} times`);
console.log(vatOnLine(-10, 15.5, false) === -1.55 ? "PASS  negative totals mirror positive" : "FAIL  negative totals");
if (bad || vatOnLine(-10, 15.5, false) !== -1.55) process.exit(1);
console.log("All checks passed");
