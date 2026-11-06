/**
 * Live end-to-end run against the ZIMRA TEST gateway with OUR signing code (RSA or ECDSA key from the
 * device certificate): GetConfig, GetStatus, OpenDay, receipts, CloseDay, and a check that the day closed.
 * Everything sent and received is saved under test-output/ so a failed day can be understood afterwards.
 *
 *   npm run e2e -- "<certificates folder>" <deviceId> [--scenario=basic|full] [--yes]
 *
 * basic: two USD receipts (one mixed standard-rated and exempt), chained, then close.
 * full:  basic plus a ZWG receipt and a credit note on the first receipt.
 * Without --yes nothing is sent except the read-only GetConfig/GetStatus.
 *
 * A bad receipt cannot be taken back: ZIMRA flags it and the day then cannot be closed from here.
 * Run `full` only after `basic` has closed cleanly on a device.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FiscalDevice } from "../src/core/device.js";
import { cents } from "../src/core/money.js";
import { MemoryStorage } from "../src/core/storage.js";
import { assertKeyMatchesCertificate, parseDeviceCertificate } from "../src/devices/cert-info.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [root, idArg] = args;
const yes = flags.includes("--yes");
const scenario = flags.find((f) => f.startsWith("--scenario="))?.split("=")[1] ?? "basic";
if (!root || !idArg || !["basic", "full"].includes(scenario)) {
  console.error('Usage: npm run e2e -- "<certificates folder>" <deviceId> [--scenario=basic|full] [--yes]');
  process.exit(2);
}

const dir = join(root, `certificates_${idArg}`);
const certificatePem = readFileSync(join(dir, "cert.crt"), "utf-8");
const privateKeyPem = readFileSync(join(dir, "key.key"), "utf-8");
const info = parseDeviceCertificate(certificatePem);
assertKeyMatchesCertificate(certificatePem, privateKeyPem);
const signer = new KeySigner(privateKeyPem);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const out = join("test-output", `e2e-${info.deviceId}-${runId}`);
mkdirSync(out, { recursive: true });
const log: unknown[] = [];
const save = (step: string, data: unknown) => {
  log.push({ at: new Date().toISOString(), step, data });
  writeFileSync(join(out, "run.json"), JSON.stringify(log, null, 2));
};

const fd = new FiscalDevice(
  { deviceId: info.deviceId, serialNumber: info.serialNumber, modelName: "Server", modelVersion: "v1" },
  { signer, transport: new NodeTransport({ certificatePem, privateKeyPem }), storage: new MemoryStorage() },
  { environment: "test" },
);

const step = (s: string) => console.log(s);
step(`Device ${info.deviceId} ${info.serialNumber}: ${info.keyType.toUpperCase()} key, certificate valid ${info.daysLeft} more days. Output: ${out}`);

const config = await fd.getConfig();
save("GetConfig", config);
const status = await fd.getStatus();
save("GetStatus", status);
step(`Status: ${status.fiscalDayStatus}, last day ${status.lastFiscalDayNo}, last global no ${status.lastReceiptGlobalNo}`);

if (status.fiscalDayStatus !== "FiscalDayClosed") {
  console.error(`Refusing to continue: the day is ${status.fiscalDayStatus}${status.fiscalDayClosingErrorCode ? ` (${status.fiscalDayClosingErrorCode})` : ""}. A clean closed day is required.`);
  process.exit(1);
}
if (!yes) {
  console.log("Read-only checks done. Add --yes to open a day and send receipts.");
  process.exit(0);
}

const taxes = config.applicableTaxes;
// The standard VAT rate, not the first taxed line: the first one on the test taxpayers is a 5% withholding tax.
const standard = taxes.find((t) => t.taxPercent === 15.5) ?? taxes.find((t) => /standard/i.test(t.taxName)) ?? taxes[0]!;
// A VAT payer must give every line an 8 digit HS code (RCPT047/RCPT048 are Red and cannot be undone).
const HS = "99001000";
const exempt = taxes.find((t) => t.taxPercent === null || t.taxPercent === undefined);
if (!standard || (standard.taxPercent ?? 0) <= 0) throw new Error("No standard rated tax found in GetConfig");

const day = await fd.openDay();
save("OpenDay", day);
step(`Opened fiscal day ${day.fiscalDayNo}`);
// ZIMRA stamps the day-open time itself; a receipt dated before it gets a Yellow RCPT014. Leave a gap.
await new Promise((r) => setTimeout(r, 4000));

const tag = Date.now().toString(36).toUpperCase();
const send = async (label: string, input: Parameters<FiscalDevice["submitReceipt"]>[0]) => {
  const r = await fd.submitReceipt(input);
  save(label, { input, receiptID: r.response.receiptID, validationErrors: r.response.validationErrors, qrData: r.qrData, state: fd.getState() });
  const errs = r.response.validationErrors ?? [];
  step(`${label}: receiptID ${r.response.receiptID}, validation errors ${errs.length ? JSON.stringify(errs) : "none"}`);
  if (errs.length) throw new Error(`${label} came back with validation errors; stopping before anything else is sent.`);
  return r;
};

try {
  await send("receipt-1 USD standard", {
    currency: "USD",
    invoiceNo: `E2E-${tag}-1`,
    lines: [{ name: "Consulting services", price: 115.0, quantity: 1, taxId: standard.taxID, taxPercent: standard.taxPercent, hsCode: HS }],
    payments: [{ moneyType: "Cash", amount: 115.0 }],
  });
  const globalNo1 = fd.getState()?.receiptGlobalNo ?? 0;
  await send("receipt-2 USD mixed", {
    currency: "USD",
    invoiceNo: `E2E-${tag}-2`,
    lines: [
      { name: "Training workshop", price: cents("57.50"), quantity: 2, taxId: standard.taxID, taxPercent: standard.taxPercent, hsCode: HS },
      ...(exempt ? [{ name: "Exempt booklet", price: cents("10.00"), quantity: 1, taxId: exempt.taxID, taxPercent: null, hsCode: HS }] : []),
    ],
    payments: [{ moneyType: "Card", amount: cents(exempt ? "125.00" : "115.00") }],
  });
  if (scenario === "full") {
    await send("receipt-3 ZWG standard", {
      currency: "ZWG",
      invoiceNo: `E2E-${tag}-3`,
      lines: [{ name: "Maize meal 10kg", price: cents("310.50"), quantity: 1, taxId: standard.taxID, taxPercent: standard.taxPercent, hsCode: HS }],
      payments: [{ moneyType: "Cash", amount: cents("310.50") }],
    });
    await send("credit-note USD", {
      receiptType: "CreditNote",
      currency: "USD",
      invoiceNo: `E2E-${tag}-CN1`,
      notes: "E2E credit note",
      creditDebitNote: { deviceID: info.deviceId, receiptGlobalNo: globalNo1, fiscalDayNo: day.fiscalDayNo },
      lines: [{ name: "Consulting services", price: cents("-115.00"), quantity: 1, taxId: standard.taxID, taxPercent: standard.taxPercent, hsCode: HS }],
      payments: [{ moneyType: "Cash", amount: cents("-115.00") }],
    });
  }
} catch (e) {
  save("error", String(e));
  console.error(String(e));
  console.error("The day is left OPEN so it can be inspected; do not close it blindly.");
  process.exit(1);
}

step("Closing the day with signed counters…");
const closed = await fd.closeDay();
save("CloseDay", closed);
let final = await fd.getStatus();
for (let i = 0; i < 15 && final.fiscalDayStatus === "FiscalDayCloseInitiated"; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  final = await fd.getStatus();
}
save("final-status", final);
step(`Final status: ${final.fiscalDayStatus}${final.fiscalDayClosingErrorCode ? ` (${final.fiscalDayClosingErrorCode})` : ""}`);
if (final.fiscalDayStatus !== "FiscalDayClosed") process.exit(1);
console.log("E2E PASSED");
