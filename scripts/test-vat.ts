/**
 * VAT per line must equal the exact value (half away from zero), which is what ZIMRA and the fiscal service work out.
 *   npx tsx scripts/test-vat.ts
 */
import { computeInvoiceTotals, computeLineTotals, vatOnLine } from "../lib/utils/invoiceCalculations";
import { buildReceiptTaxes, type ReceiptLine } from "../fiscal-service/src/core/index";

let bad = 0;
let oldWrong = 0;
for (const pct of [15.5, 15, 14.5, 5, 0]) {
  const bp = BigInt(Math.round(pct * 100));
  for (const incl of [false, true]) {
    for (let cents = 1; cents <= 30000; cents++) {
      const num = BigInt(cents) * bp;
      const den = incl ? BigInt(10000) + bp : BigInt(10000);
      const exact = Number((BigInt(2) * num + den) / (BigInt(2) * den)) / 100; // half up on a positive value
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

// Whole invoices: the app's VAT and total must equal what the fiscal service sends to ZIMRA (tax once per tax group).
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let invoiceBad = 0;
let lineByLineWouldDiffer = 0;
const N = 20000;
for (let i = 0; i < N; i++) {
  const incl = rnd() < 0.5;
  const k = 1 + Math.floor(rnd() * 6);
  const input = Array.from({ length: k }, () => ({ description: "Item", quantity: 1 + Math.floor(rnd() * 5), unitPrice: Math.round((0.05 + rnd() * 50) * 100) / 100, taxPercent: rnd() < 0.8 ? 15.5 : 0, taxCode: "A" }));
  const lines = computeLineTotals(input, incl);
  const totals = computeInvoiceTotals(lines);
  const rl: ReceiptLine[] = lines.map((l, n) => ({ receiptLineType: "Sale", receiptLineNo: n + 1, receiptLineHSCode: null, receiptLineName: "Item", receiptLinePrice: l.unitPrice, receiptLineQuantity: l.quantity, receiptLineTotal: Math.round(l.quantity * l.unitPrice * 100) / 100, taxPercent: l.taxPercent, taxID: l.taxPercent === 0 ? 2 : 517 }) as ReceiptLine);
  const taxes = buildReceiptTaxes(rl, incl);
  const svcVat = Math.round(taxes.reduce((t, x) => t + x.taxAmount * 100, 0)) / 100;
  const svcTotal = Math.round(taxes.reduce((t, x) => t + x.salesAmountWithTax * 100, 0)) / 100;
  const lineSum = Math.round(lines.reduce((t, l) => t + l.vatAmount * 100, 0));
  if (Math.abs(svcVat - totals.totalVat) > 1e-9 || Math.abs(svcTotal - totals.totalAmount) > 1e-9 || Math.round(totals.totalVat * 100) !== lineSum) invoiceBad++;
  const naive = Math.round(input.reduce((t, l) => t + vatOnLine(Math.round(l.quantity * l.unitPrice * 100) / 100, l.taxPercent, incl) * 100, 0));
  if (naive !== Math.round(svcVat * 100)) lineByLineWouldDiffer++;
}
console.log(`whole invoices: app VAT/total differ from the fiscal service in ${invoiceBad} of ${N}; line-by-line rounding would have differed in ${lineByLineWouldDiffer} (the real gateway flags those Red)`);
const known = computeInvoiceTotals(computeLineTotals([{ description: "a", quantity: 3, unitPrice: 0.9, taxPercent: 15.5, taxCode: "A" }, { description: "b", quantity: 1, unitPrice: 3.4, taxPercent: 15.5, taxCode: "A" }, { description: "c", quantity: 1, unitPrice: 2.2, taxPercent: 15.5, taxCode: "A" }], true));
const knownEx = computeInvoiceTotals(computeLineTotals([{ description: "a", quantity: 1, unitPrice: 1.5, taxPercent: 15.5, taxCode: "A" }, { description: "b", quantity: 1, unitPrice: 4.75, taxPercent: 15.5, taxCode: "A" }, { description: "c", quantity: 2, unitPrice: 1.5, taxPercent: 15.5, taxCode: "A" }], false));
const k1 = known.totalVat === 1.11 && known.totalAmount === 8.3;
const k2 = knownEx.totalVat === 1.43 && knownEx.totalAmount === 10.68;
console.log(k1 ? "PASS  8.30 inclusive receipt: VAT 1.11 (as ZIMRA)" : `FAIL  8.30 receipt ${JSON.stringify(known)}`);
console.log(k2 ? "PASS  9.25 exclusive receipt: VAT 1.43, total 10.68 (as ZIMRA)" : `FAIL  exclusive receipt ${JSON.stringify(knownEx)}`);
if (invoiceBad || !k1 || !k2) process.exit(1);
console.log("All checks passed");
