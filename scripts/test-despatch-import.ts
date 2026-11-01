/**
 * Slip price conversion and total comparison.
 *   npx tsx scripts/test-despatch-import.ts
 */
import { compareWithSlipTotal, parsePrice, parseQuantity, slipPriceToTillPrice } from "../lib/pos/despatchImport";

let bad = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) bad++;
};

check("same basis: price unchanged", slipPriceToTillPrice(10, true, true, 15.5) === 10 && slipPriceToTillPrice(10, false, false, 15.5) === 10);
check("slip ex-VAT, till inclusive: adds VAT", slipPriceToTillPrice(10, false, true, 15.5) === 11.55);
check("slip incl-VAT, till exclusive: removes VAT", slipPriceToTillPrice(11.55, true, false, 15.5) === 10);
check("result is always 2 dp", slipPriceToTillPrice(3.333, false, true, 15) === 3.83);
check("zero VAT rate changes nothing", slipPriceToTillPrice(7.25, false, true, 0) === 7.25);

check("total equal to slip total matches", compareWithSlipTotal(115.5, 115.5, 100).result === "match");
check("total equal before VAT matches excl", compareWithSlipTotal(100, 115.5, 100).result === "match-excl");
const d = compareWithSlipTotal(115.5, 115.52, 100.02);
check("a cent or two is reported as a difference", d.result === "differs" && d.difference === 0.02);
check("no slip total is unknown", compareWithSlipTotal(null, 10, 8).result === "unknown");

check("price parse", parsePrice("12.5") === 12.5 && parsePrice("1,200.00") === 1200 && parsePrice("0") === null && parsePrice("abc") === null && parsePrice("") === null);
check("price parse rounds to 2 dp", parsePrice("1.005") === 1.01 || parsePrice("1.005") === 1);
check("quantity parse", parseQuantity("2.5") === 2.5 && parseQuantity("0") === null && parseQuantity("1.23456") === 1.235 && parseQuantity("1000000") === null);

if (bad) process.exit(1);
console.log("All checks passed");
