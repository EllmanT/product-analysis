/**
 * A4 PDF renders (including a long invoice that runs to a second page) and the compliance check works.
 *   npx tsx scripts/test-a4-pdf.ts [output-dir]   (writes sample PDFs there when a directory is given)
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";

import { a4MissingElements, renderA4Pdf } from "../lib/pos/a4Pdf";
import type { SlipBranch, SlipSale } from "../lib/pos/slip";

let bad = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) bad++;
};

const branch: SlipBranch = {
  companyName: "Amanat Lighting (Pvt) Ltd",
  branchName: "Harare Main",
  address: "12 Example Road, Southerton, Harare",
  phone: "+263 242 000000",
  email: "sales@example.com",
  tin: "2000123456",
  vatNumber: "10012345",
  footerLines: ["Goods once sold are not returnable", "Thank you for your business"],
};

const line = (i: number) => ({
  taxCode: "A",
  description: i === 3 ? "LED panel light 600x600 recessed ceiling fitting, cool white, 40W, with driver and mounting clips – special order ✓" : `Item ${i} conduit pipe 20mm`,
  quantity: i,
  unitPrice: 11.55,
  taxPercent: 15.5,
  vatAmount: Math.round(((11.55 * i) - (11.55 * i) / 1.155) * 100) / 100,
  lineTotalExcl: Math.round(((11.55 * i) / 1.155) * 100) / 100,
  lineTotalIncl: Math.round(11.55 * i * 100) / 100,
});

function sale(n: number): SlipSale {
  const lines = Array.from({ length: n }, (_, i) => line(i + 1));
  const total = lines.reduce((s, l) => s + l.lineTotalIncl, 0);
  const vat = lines.reduce((s, l) => s + l.vatAmount, 0);
  return {
    status: "FISCALISED",
    currency: "USD",
    paymentMethod: "CASH",
    lines,
    subtotalExclTax: Math.round((total - vat) * 100) / 100,
    totalVat: Math.round(vat * 100) / 100,
    totalAmount: Math.round(total * 100) / 100,
    buyer: { registerName: "Example Electrical (Pvt) Ltd", tradeName: "Example Electrical", tin: "2000999888", vatNumber: "10099988", address: "5 Industrial Way", city: "Bulawayo", email: "accounts@example.com" },
    invoiceNumber: "HU0042",
    soldAt: new Date("2026-11-02T09:15:00Z"),
    fiscal: {
      verificationCode: "A1B2-C3D4-E5F6",
      verificationLink: "https://fdmstest.zimra.co.zw/verify/2000123456000012345678901234567890123456789012345678901234567890",
      qrCodeUrl: "https://fdmstest.zimra.co.zw/verify/2000123456",
      fiscalDayNo: 17,
      receiptGlobalNo: "HU0042",
      receiptCounter: 8,
      deviceId: "12345",
      deviceSerialNumber: "SN-777",
      receiptDate: "2026-11-02T11:15:04",
    },
  };
}

async function main() {
  const qrPng = await QRCode.toBuffer("https://fdmstest.zimra.co.zw/verify/2000123456", { margin: 1, width: 320 });
  const small = await renderA4Pdf(sale(4), branch, { qrPng });
  const big = await renderA4Pdf(sale(60), branch, { qrPng });

  check("renders a PDF", Buffer.from(small.slice(0, 5)).toString() === "%PDF-");
  check("short invoice is one page", (await PDFDocument.load(small)).getPageCount() === 1);
  check("long invoice runs to more pages", (await PDFDocument.load(big)).getPageCount() >= 2);

  const dup = await renderA4Pdf(sale(2), branch, { qrPng, duplicate: true });
  check("duplicate copy renders", dup.length > 1000);
  const prov = await renderA4Pdf({ ...sale(2), status: "UNFISCALISED", fiscal: undefined, provisionalNumber: "HUP0007" }, branch);
  check("provisional receipt renders without a QR", prov.length > 1000);

  check("complete invoice has nothing missing", a4MissingElements(sale(2), branch).length === 0);
  const m = a4MissingElements({ ...sale(2), buyer: {}, fiscal: { verificationCode: "X" } }, { companyName: "A" });
  check("missing elements are named", ["seller TIN", "seller VAT number", "buyer name", "fiscal device ID", "QR code"].every((x) => m.includes(x)));
  check("no VAT charged: seller VAT number not required", !a4MissingElements({ ...sale(1), totalVat: 0 }, { ...branch, vatNumber: "" }).includes("seller VAT number"));

  const out = process.argv[2];
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "sample-short.pdf"), small);
    writeFileSync(join(out, "sample-long.pdf"), big);
  }
  if (bad) process.exit(1);
  console.log("All checks passed");
}
void main();
