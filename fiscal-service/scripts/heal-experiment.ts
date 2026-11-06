/**
 * One-off experiment: can a receipt ZIMRA flagged Red be replaced by resending it corrected with the same
 * receipt numbers? Uses a device whose open day holds exactly one Red receipt (28892 after the first
 * e2e run, missing HS codes). Everything is saved under test-output/.
 *
 *   npx tsx scripts/heal-experiment.ts "<certificates folder>" 28892 <invoiceNo> [--newInvoice] --yes
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FiscalDevice } from "../src/core/device.js";
import { MemoryStorage } from "../src/core/storage.js";
import { parseDeviceCertificate } from "../src/devices/cert-info.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [root, idArg, invoiceNo] = args;
if (!root || !idArg || !invoiceNo || !flags.includes("--yes")) {
  console.error("Usage: heal-experiment.ts <certificates folder> <deviceId> <invoiceNo> [--newInvoice] --yes");
  process.exit(2);
}
const dir = join(root, `certificates_${idArg}`);
const certificatePem = readFileSync(join(dir, "cert.crt"), "utf-8");
const privateKeyPem = readFileSync(join(dir, "key.key"), "utf-8");
const info = parseDeviceCertificate(certificatePem);

const out = join("test-output", `heal-${info.deviceId}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });

const fd = new FiscalDevice(
  { deviceId: info.deviceId, serialNumber: info.serialNumber, modelName: "Server", modelVersion: "v1" },
  { signer: new KeySigner(privateKeyPem), transport: new NodeTransport({ certificatePem, privateKeyPem }), storage: new MemoryStorage() },
  { environment: "test" },
);

const config = await fd.getConfig();
const status = await fd.getStatus();
console.log(`Status: ${status.fiscalDayStatus}, day ${status.lastFiscalDayNo}, last global no ${status.lastReceiptGlobalNo}`);
const standard = config.applicableTaxes.find((t) => t.taxPercent === 15.5);
if (!standard) throw new Error("No 15.5% tax in config");

// State exactly as it was before the Red receipt: day 4 open, no receipts yet, last global number 5.
fd.restoreState({
  fiscalDayNo: status.lastFiscalDayNo!,
  fiscalDayDate: new Date().toISOString().slice(0, 10),
  receiptCounter: 0,
  receiptGlobalNo: status.lastReceiptGlobalNo! - 1,
  counters: [],
} as never);

const useInvoice = flags.includes("--newInvoice") ? `${invoiceNo}-B` : invoiceNo;
const r = await fd.submitReceipt({
  currency: "USD",
  invoiceNo: useInvoice,
  lines: [{ name: "Consulting services", price: 115.0, quantity: 1, taxId: standard.taxID, taxPercent: standard.taxPercent, hsCode: "99001000" }],
  payments: [{ moneyType: "Cash", amount: 115.0 }],
});
writeFileSync(join(out, "result.json"), JSON.stringify({ useInvoice, response: r.response, state: fd.getState() }, null, 2));
console.log(`Resent as ${useInvoice}: receiptID ${r.response.receiptID}, validation errors ${JSON.stringify(r.response.validationErrors ?? [])}`);
const after = await fd.getStatus();
console.log(`Status after: ${after.fiscalDayStatus}, last global no ${after.lastReceiptGlobalNo}`);
