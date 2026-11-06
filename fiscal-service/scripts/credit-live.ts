/**
 * Real-gateway credit-note probe: day A makes originals, day B issues partial credits against the EARLIER day originals (USD, ZWG, exempt mixed, cumulative to zero), each day closed by our own CloseDay.
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
const out = join("test-output", `credit-${info.deviceId}-${runId}`);
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
const standard = taxes.find((t) => t.taxPercent === 15.5)!;
const exempt = taxes.find((t) => t.taxPercent === null || t.taxPercent === undefined)!;
const HS = "99001000";
const tag = Date.now().toString(36).toUpperCase();
const line = (name: string, price: string, qty: number, t: typeof standard) => ({ name, price: cents(price), quantity: qty, taxId: t.taxID, taxPercent: t.taxPercent ?? null, hsCode: HS });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const send = async (label: string, input: Parameters<FiscalDevice["submitReceipt"]>[0]) => {
  const r = await fd.submitReceipt(input);
  const errs = r.response.validationErrors ?? [];
  save(label, { input, receiptID: r.response.receiptID, validationErrors: errs, state: fd.getState() });
  step(`${label}: receiptID ${r.response.receiptID}, validation errors ${errs.length ? JSON.stringify(errs) : "none"}`);
  if (errs.length) throw new Error(`${label} came back with validation errors; stopping.`);
  return fd.getState()!;
};
const close = async () => {
  await fd.closeDay();
  let s = await fd.getStatus();
  for (let i = 0; i < 15 && s.fiscalDayStatus === "FiscalDayCloseInitiated"; i++) { await wait(3000); s = await fd.getStatus(); }
  step(`close: ${s.fiscalDayStatus}${s.fiscalDayClosingErrorCode ? ` (${s.fiscalDayClosingErrorCode})` : ""}`);
  save("close", s);
  if (s.fiscalDayStatus !== "FiscalDayClosed") throw new Error("day did not close");
};

try {
  // Day A: originals
  const dayA = await fd.openDay();
  step(`Day A = fiscal day ${dayA.fiscalDayNo}`);
  await wait(4000);
  const o1 = await send("A-O1 USD standard+exempt", { currency: "USD", invoiceNo: `CR-${tag}-O1`, lines: [line("Consulting", "100.00", 1, standard), line("Booklet", "20.00", 1, exempt)], payments: [{ moneyType: "Cash", amount: cents("120.00") }] });
  const o1No = o1.receiptGlobalNo;
  const o2 = await send("A-O2 ZWG standard", { currency: "ZWG", invoiceNo: `CR-${tag}-O2`, lines: [line("Maize meal", "200.00", 1, standard)], payments: [{ moneyType: "Card", amount: cents("200.00") }] });
  const o2No = o2.receiptGlobalNo;
  await close();

  // Day B: credits against day A originals
  const dayB = await fd.openDay();
  step(`Day B = fiscal day ${dayB.fiscalDayNo}`);
  await wait(4000);
  const ref = (no: number) => ({ deviceID: info.deviceId, receiptGlobalNo: no, fiscalDayNo: dayA.fiscalDayNo });
  await send("B-CN1 partial of O1 (standard -40)", { receiptType: "CreditNote", currency: "USD", invoiceNo: `CR-${tag}-C1`, notes: "partial credit 1", creditDebitNote: ref(o1No), lines: [line("Consulting", "-40.00", 1, standard)], payments: [{ moneyType: "Cash", amount: cents("-40.00") }] });
  await send("B-CN2 rest of O1 (standard -60, exempt -20)", { receiptType: "CreditNote", currency: "USD", invoiceNo: `CR-${tag}-C2`, notes: "partial credit 2", creditDebitNote: ref(o1No), lines: [line("Consulting", "-60.00", 1, standard), line("Booklet", "-20.00", 1, exempt)], payments: [{ moneyType: "Cash", amount: cents("-80.00") }] });
  await send("B-CN3 partial of O2 ZWG (-50)", { receiptType: "CreditNote", currency: "ZWG", invoiceNo: `CR-${tag}-C3`, notes: "zwg partial", creditDebitNote: ref(o2No), lines: [line("Maize meal", "-50.00", 1, standard)], payments: [{ moneyType: "Card", amount: cents("-50.00") }] });
  await send("B-S1 normal sale USD", { currency: "USD", invoiceNo: `CR-${tag}-S1`, lines: [line("Soap", "10.00", 2, standard)], payments: [{ moneyType: "Cash", amount: cents("20.00") }] });
  await close();
  console.log("CREDIT PROBE PASSED");
} catch (e) {
  save("error", String(e));
  console.error(String(e));
  console.error("The day is left OPEN; close it on the ops portal if needed (device, fiscal day number).");
  process.exit(1);
}
