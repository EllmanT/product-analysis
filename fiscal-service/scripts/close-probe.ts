/**
 * Tries to close an open (or failed-close) fiscal day on the REAL test gateway with OUR signing code, for a day
 * whose receipts we did not record. ZIMRA validates the close in a fixed order: signature first, then missing
 * receipts, then receipts with validation errors, then counters. So the reply tells us what was wrong:
 *   BadCertificateSignature  -> the signature (or the fiscal day date inside it) was not accepted;
 *   anything else            -> the signature WAS accepted (this proves our signing against the real gateway);
 *   Closed                   -> the day held no receipts and is now closed: the device is clean again.
 * The fiscal day date is the date the day was opened, which GetStatus does not give, so it scans back from today.
 *
 *   npx tsx scripts/close-probe.ts "<certs dir>" <deviceId> [--days=45] [--counters=empty]
 * Retrying a close is allowed by ZIMRA; each attempt leaves the day OPEN or CLOSE-FAILED, never worse.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FiscalDevice } from "../src/core/device.js";
import { MemoryStorage } from "../src/core/storage.js";
import { fdmsDate } from "../src/core/signing.js";
import { FdmsApiError } from "../src/core/types.js";
import { parseDeviceCertificate } from "../src/devices/cert-info.js";
import { KeySigner } from "../src/node/key-signer.js";
import { NodeTransport } from "../src/node/transport.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [root, idArg] = args;
const days = Number(flags.find((f) => f.startsWith("--days="))?.split("=")[1] ?? 45);
if (!root || !idArg) {
  console.error('Usage: close-probe.ts "<certs dir>" <deviceId> [--days=45]');
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

const st0 = await fd.getStatus();
console.log(`Device ${info.deviceId}: ${st0.fiscalDayStatus}, day ${st0.lastFiscalDayNo}, last global no ${st0.lastReceiptGlobalNo}${st0.fiscalDayClosingErrorCode ? `, ${st0.fiscalDayClosingErrorCode}` : ""}`);
if (st0.fiscalDayStatus !== "FiscalDayOpened" && st0.fiscalDayStatus !== "FiscalDayCloseFailed") {
  console.log("Nothing to close.");
  process.exit(0);
}

const settle = async () => {
  for (let i = 0; i < 40; i++) {
    const s = await fd.getStatus();
    if (s.fiscalDayStatus !== "FiscalDayCloseInitiated") return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return fd.getStatus();
};

const today = Date.now();
for (let back = 0; back <= days; back++) {
  const date = fdmsDate(new Date(today - back * 86_400_000));
  fd.restoreState({ fiscalDayNo: st0.lastFiscalDayNo!, fiscalDayDate: date, receiptCounter: 0, receiptGlobalNo: st0.lastReceiptGlobalNo!, counters: [] });
  let line = `  date ${date}: `;
  try {
    await fd.closeDay({ force: true });
    const s = await settle();
    line += s.fiscalDayStatus === "FiscalDayClosed" ? "CLOSED" : `${s.fiscalDayStatus} ${s.fiscalDayClosingErrorCode ?? ""}`;
    console.log(line);
    if (s.fiscalDayStatus === "FiscalDayClosed") {
      console.log(`\nThe day held no receipts we did not know of: device ${info.deviceId} is CLOSED and clean again.`);
      process.exit(0);
    }
    if (s.fiscalDayClosingErrorCode && s.fiscalDayClosingErrorCode !== "BadCertificateSignature") {
      console.log(`\nZIMRA accepted our signature for ${date} (it then reports ${s.fiscalDayClosingErrorCode}). The day holds receipts whose counters we do not know.`);
      process.exit(0);
    }
  } catch (e) {
    line += e instanceof FdmsApiError ? `refused HTTP ${e.status}: ${e.message}` : String(e);
    console.log(line);
    if (e instanceof FdmsApiError && e.status === 422) {
      console.log("\nZIMRA refused the close request itself (see above); no date will change that.");
      process.exit(0);
    }
  }
}
console.log("\nNo date in the range was accepted.");
