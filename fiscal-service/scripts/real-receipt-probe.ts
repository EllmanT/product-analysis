/**
 * Real-gateway receipt probe on a device whose open day is ALREADY unclosable (so nothing can be made worse).
 * It continues that day's receipt chain correctly from a saved state and sends: a USD receipt, a ZWG receipt,
 * a credit note against the first, and the same signed receipt a second time. For each reply it prints the
 * validation errors ZIMRA gave. What we are looking for is the ABSENCE of RCPT010 (signature), RCPT011/012
 * (counters), RCPT013 (duplicate invoice), RCPT047/048 (HS code), RCPT022/035/043 (credit note rules): those
 * would show our receipts are not accepted. Older Gray/Red flags on the day are expected and ignored.
 *
 *   npx tsx scripts/real-receipt-probe.ts "<certs dir>" <deviceId> <saved-state.json>
 * where the state file has { state: FiscalDayState } as written by heal-experiment.ts / run.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FiscalDevice } from "../src/core/device.js";
import { cents } from "../src/core/money.js";
import { MemoryStorage } from "../src/core/storage.js";
import { parseDeviceCertificate } from "../src/devices/cert-info.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";

const [root, idArg, stateFile] = process.argv.slice(2);
if (!root || !idArg || !stateFile) {
  console.error('Usage: real-receipt-probe.ts "<certs dir>" <deviceId> <state.json>');
  process.exit(2);
}
const dir = join(root, `certificates_${idArg}`);
const certificatePem = readFileSync(join(dir, "cert.crt"), "utf-8");
const privateKeyPem = readFileSync(join(dir, "key.key"), "utf-8");
const info = parseDeviceCertificate(certificatePem);
const fd = new FiscalDevice(
  { deviceId: info.deviceId, serialNumber: info.serialNumber, modelName: "Server", modelVersion: "v1" },
  { signer: new KeySigner(privateKeyPem), transport: new NodeTransport({ certificatePem, privateKeyPem }), storage: new MemoryStorage() },
  { environment: "test", retries: 1 }
);

const out = join("test-output", `real-probe-${info.deviceId}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });
const log: unknown[] = [];

const config = await fd.getConfig();
const status = await fd.getStatus();
console.log(`Device ${info.deviceId}: ${status.fiscalDayStatus}, day ${status.lastFiscalDayNo}, last global no ${status.lastReceiptGlobalNo}`);
const saved = JSON.parse(readFileSync(stateFile, "utf-8")) as { state: Parameters<FiscalDevice["restoreState"]>[0] };
if (saved.state.receiptGlobalNo !== status.lastReceiptGlobalNo) {
  console.error(`Saved state is at global no ${saved.state.receiptGlobalNo} but ZIMRA is at ${status.lastReceiptGlobalNo}: the chain would not continue. Stopping.`);
  process.exit(1);
}
fd.restoreState(saved.state);

const standard = config.applicableTaxes.find((t) => t.taxPercent === 15.5)!;
const HS = "99001000";
const line = (price: string, name = "Probe item") => ({ name, price: cents(price), quantity: 1, taxId: standard.taxID, taxPercent: standard.taxPercent, hsCode: HS });
const tag = Date.now().toString(36).toUpperCase();
const show = (label: string, errs: { validationErrorCode?: string; validationErrorColor?: string }[] | null | undefined) => {
  const e = (errs ?? []).map((x) => `${x.validationErrorCode}:${x.validationErrorColor}`);
  console.log(`${label}: ${e.length ? e.join(", ") : "NO VALIDATION ERRORS"}`);
  log.push({ label, errors: errs });
};

const gap = () => new Promise((r) => setTimeout(r, 1100));
await gap();
const r1 = await fd.submitReceipt({ currency: "USD", invoiceNo: `PROBE-${tag}-1`, lines: [line("10.00")], payments: [{ moneyType: "Cash", amount: cents("10.00") }] });
show("USD receipt", r1.response.validationErrors);
const g1 = fd.getState()!.receiptGlobalNo;
await gap();
const r2 = await fd.submitReceipt({ currency: "ZWG", invoiceNo: `PROBE-${tag}-2`, lines: [line("265.50")], payments: [{ moneyType: "Cash", amount: cents("265.50") }] });
show("ZWG receipt", r2.response.validationErrors);
await gap();
const cn = await fd.submitReceipt({
  receiptType: "CreditNote", currency: "USD", invoiceNo: `PROBE-${tag}-CN`, notes: "probe credit",
  creditDebitNote: { deviceID: info.deviceId, receiptGlobalNo: g1, fiscalDayNo: status.lastFiscalDayNo! },
  lines: [line("-4.00")], payments: [{ moneyType: "Cash", amount: cents("-4.00") }],
});
show("credit note (partial, USD)", cn.response.validationErrors);
await gap();
const over = await fd.submitReceipt({
  receiptType: "CreditNote", currency: "USD", invoiceNo: `PROBE-${tag}-CN2`, notes: "probe over-credit",
  creditDebitNote: { deviceID: info.deviceId, receiptGlobalNo: g1, fiscalDayNo: status.lastFiscalDayNo! },
  lines: [line("-9.00")], payments: [{ moneyType: "Cash", amount: cents("-9.00") }],
});
show("credit note that over-credits (expected RCPT035)", over.response.validationErrors);

// The same signed receipt sent again: what does the real gateway answer?
await gap();
const prepared = await fd.signReceipt({ currency: "USD", invoiceNo: `PROBE-${tag}-3`, lines: [line("1.00")], payments: [{ moneyType: "Cash", amount: cents("1.00") }] });
await fd.applyPrepared(prepared);
const first = await fd.submitPrepared(prepared);
const again = await fd.submitPrepared(prepared);
show("receipt, first send", first.response.validationErrors);
show("identical receipt sent a second time", again.response.validationErrors);
console.log(`same receiptID on repeat: ${first.response.receiptID === again.response.receiptID} (${first.response.receiptID} / ${again.response.receiptID})`);
log.push({ firstId: first.response.receiptID, againId: again.response.receiptID });

writeFileSync(join(out, "run.json"), JSON.stringify(log, null, 2));
const after = await fd.getStatus();
console.log(`Status after: ${after.fiscalDayStatus}, last global no ${after.lastReceiptGlobalNo}. Saved to ${out}`);
