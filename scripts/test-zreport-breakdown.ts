/** The VAT breakdown printed on a Z-report. Run: npx tsx scripts/test-zreport-breakdown.ts */
import assert from "node:assert/strict";

import { buildBreakdown } from "@/lib/zReportBreakdown";

const line = (taxPercent: number, excl: number, vat: number) => ({ taxPercent, lineTotalExcl: excl, vatAmount: vat, lineTotalIncl: Math.round((excl + vat) * 100) / 100 });

const b = buildBreakdown([
  { currency: "USD", lines: [line(15.5, 100, 15.5), line(0, 10, 0)] },
  { currency: "USD", lines: [line(15.5, 50.1, 7.77)] },
  { currency: "ZWG", lines: [line(15.5, 1000, 155)] },
  { currency: "USD", kind: "CREDIT_NOTE", lines: [line(15.5, -50.1, -7.77)] },
]);

const usd = b.currencies.find((c) => c.currency === "USD")!;
assert.equal(usd.receipts, 2);
assert.equal(usd.creditNotes, 1);
const std = usd.rates.find((r) => r.taxPercent === 15.5)!;
assert.equal(std.nett, 100, "the credit note takes off what the second sale added");
assert.equal(std.tax, 15.5);
assert.equal(std.gross, 115.5);
assert.deepEqual(usd.rates.map((r) => r.taxPercent), [0, 15.5], "rates are listed in order");
assert.equal(usd.gross, 125.5, "day total is after credit notes");
assert.equal(usd.creditsGross, -57.87);
assert.equal(b.currencies.map((c) => c.currency).join(), "USD,ZWG");

// A credit note stored with positive amounts still reduces the day.
const c = buildBreakdown([
  { currency: "USD", lines: [line(15.5, 100, 15.5)] },
  { currency: "USD", kind: "CREDIT_NOTE", lines: [line(15.5, 100, 15.5)] },
]);
assert.equal(c.currencies[0].gross, 0);

// Cents are added as whole numbers: no 0.1 + 0.2 drift.
const d = buildBreakdown([{ currency: "USD", lines: [line(0, 0.1, 0), line(0, 0.2, 0)] }]);
assert.equal(d.currencies[0].nett, 0.3);

assert.deepEqual(buildBreakdown([]).currencies, []);
console.log("ok: z-report breakdown");
