/**
 * The evidence tool itself must be trustworthy: it has to PASS a good receipt and CATCH a bad one.
 *   npx tsx scripts/test-receipt-evidence.ts [--offline]     (--offline skips the call to ZIMRA's verification page)
 * Uses a real receipt accepted by the ZIMRA test gateway (device 29203, 2026-11-06) so the live lookup has something to find.
 */
import { join } from "node:path";
import { mkdirSync } from "node:fs";

import { EvidenceRenderer, buildReceiptEvidence, parseQrUrl } from "./evidence/receipt-evidence";
import type { SlipBranch, SlipSale } from "../lib/pos/slip";

const offline = process.argv.includes("--offline");
let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `   -> ${detail}` : ""}`);
  if (!ok) bad++;
};

const REAL_QR = "https://fdmstest.zimra.co.zw/00000292030611202600000000264693346d6a023a00";
const branch: SlipBranch = { companyName: "AXIS SOLUTIONS (PVT) LTD", branchName: "Test branch", address: "60 Bargate, Harare", tin: "2000152398", vatNumber: "220174256", footerLines: ["Thank you"] };
const base = (over: Partial<SlipSale> = {}): SlipSale => ({
  status: "FISCALISED",
  currency: "USD",
  paymentMethod: "CASH",
  lines: [{ taxCode: "A", description: "Consulting services", quantity: 1, unitPrice: 115, taxPercent: 15.5, vatAmount: 15.43, lineTotalExcl: 99.57, lineTotalIncl: 115 }],
  subtotalExclTax: 99.57,
  totalVat: 15.43,
  totalAmount: 115,
  buyer: { registerName: "Example Customer (Pvt) Ltd", tin: "2000999888", email: "a@example.com" },
  invoiceNumber: "EV0001",
  soldAt: new Date("2026-11-06T02:30:26Z"),
  fiscal: { verificationCode: "4693-346D-6A02-3A00", verificationLink: REAL_QR, qrCodeUrl: REAL_QR, fiscalDayNo: 18, receiptGlobalNo: "26", receiptCounter: 1, deviceId: "29203", deviceSerialNumber: "VR-EFE618A3339A25A0", receiptDate: "2026-11-06T04:30:26" },
  ...over,
});

async function main() {
  const out = join("test-evidence", "_selftest");
  mkdirSync(out, { recursive: true });
  const r = new EvidenceRenderer();
  try {
    check("QR URL parses", parseQrUrl(REAL_QR)?.globalNo === 26 && parseQrUrl(REAL_QR)?.deviceId === 29203);

    console.log("\nGood receipt");
    const good = await buildReceiptEvidence(r, { dir: join(out, "good"), sale: base(), branch, gatewayQrUrl: REAL_QR, expectTotal: 115, expectCurrency: "USD", lookup: !offline, lookupTries: 2, lookupWaitMs: 3000, mustContain: ["Example Customer"] });
    for (const c of good.checks) check(c.name, c.ok || c.level === "warn", c.detail);
    check("overall: good receipt passes", good.ok);
    check("QR image was extracted from the PDF", good.files.includes("qr.png"));

    console.log("\nBad receipt: printed code does not match the QR");
    const badCode = await buildReceiptEvidence(r, { dir: join(out, "bad-code"), sale: base({ fiscal: { ...base().fiscal!, verificationCode: "AAAA-BBBB-CCCC-DDDD" } }), branch, gatewayQrUrl: REAL_QR, lookup: false });
    check("a wrong printed verification code is caught", !badCode.ok && badCode.checks.some((c) => !c.ok && /verification code/.test(c.name)));

    console.log("\nBad receipt: the PDF carries a different QR than the gateway returned");
    const tampered = REAL_QR.slice(0, -1) + (REAL_QR.endsWith("0") ? "1" : "0");
    const wrongQr = await buildReceiptEvidence(r, { dir: join(out, "bad-qr"), sale: base(), branch, gatewayQrUrl: tampered, lookup: false });
    // The PDF is built from `tampered`, so compare against the REAL one by asking for the real one:
    const mismatch = await buildReceiptEvidence(r, { dir: join(out, "bad-qr2"), sale: base({ fiscal: { ...base().fiscal!, receiptGlobalNo: "27" } }), branch, gatewayQrUrl: REAL_QR, lookup: false });
    check("a QR for the wrong receipt number is caught", !mismatch.ok && mismatch.checks.some((c) => !c.ok && /receipt number/.test(c.name)));
    check("a changed QR code is caught by the verification-code check", !wrongQr.ok);

    console.log("\nProvisional slip (made offline)");
    const prov = await buildReceiptEvidence(r, { dir: join(out, "provisional"), sale: base({ status: "UNFISCALISED", invoiceNumber: undefined, provisionalNumber: "HUP0007", fiscal: undefined }), branch });
    for (const c of prov.checks) check(c.name, c.ok || c.level === "warn", c.detail);

    if (!offline) {
      console.log("\nZIMRA does not know a made-up receipt");
      const ghost = REAL_QR.replace("0000000026", "0000099999");
      const g = await buildReceiptEvidence(r, { dir: join(out, "ghost"), sale: base({ fiscal: { ...base().fiscal!, receiptGlobalNo: "99999", qrCodeUrl: ghost } }), branch, gatewayQrUrl: ghost, lookup: true, lookupTries: 1 });
      const l = g.checks.find((c) => /verification page/.test(c.name));
      check("a receipt ZIMRA has not received is reported as unconfirmed (warning, never a pass)", !!l && !l.ok && l.level === "warn", JSON.stringify(l));
    }
  } finally {
    await r.stop();
  }
  console.log(bad ? `\n${bad} CHECK(S) FAILED` : "\nAll checks passed");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
