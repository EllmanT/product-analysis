/**
 * Unit checks for lib/zimraDayStatus.ts, using replies captured from the real Virtual Device and gateway.
 * Run: npm run test:day-status
 */
import {
  acceptsReceipts,
  closeErrorFromMessage,
  closeErrorIsPermanent,
  deviceInvoiceNoMatches,
  isDayOpen,
  parseDayStatus,
} from "../lib/zimraDayStatus";

let failed = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

// Captured from the Virtual Device on :10005 while its day was stuck (HTTP 200, Code "0").
const closeFailed = {
  Code: "0",
  Message:
    '{"fiscalDayStatus":"FiscalDayCloseFailed","lastReceiptGlobalNo":4705,"lastFiscalDayNo":464,"fiscalDayClosingErrorCode":"CountersMismatch","operationID":"0HNPIAP7A3219:00000001"}',
  DeviceID: "29025",
};
const p1 = parseDayStatus(closeFailed);
check(p1.ok && p1.status === "FiscalDayCloseFailed", "CloseFailed reply with Code 0 is read as a state, not 'unreachable'");
check(p1.closingErrorCode === "CountersMismatch", "closing error code is extracted");
check(p1.fiscalDayNo === 464 && p1.lastReceiptGlobalNo === 4705, "day number falls back to lastFiscalDayNo");
check(acceptsReceipts(p1.status) && isDayOpen(p1.status), "a failed close still takes receipts and counts as open");

const healthy = { Code: "1", FiscalDayNo: 12, Data: { fiscalDayStatus: "FiscalDayOpened", lastReceiptGlobalNo: 40 } };
const p2 = parseDayStatus(healthy);
check(p2.ok && p2.status === "FiscalDayOpened" && p2.fiscalDayNo === 12 && p2.lastReceiptGlobalNo === 40, "healthy reply parses as before");

const closed = parseDayStatus({ Code: "1", Data: { fiscalDayStatus: "FiscalDayClosed" } });
check(closed.ok && !isDayOpen(closed.status) && !acceptsReceipts(closed.status), "closed day is not open");

const initiated = parseDayStatus({ Code: "1", Data: { fiscalDayStatus: "FiscalDayCloseInitiated" } });
check(isDayOpen(initiated.status) && !acceptsReceipts(initiated.status), "close in progress takes no receipts");

check(!parseDayStatus({ Code: "0", Message: "Device is not initialized" }).ok, "an error message without a state is not a state");
check(!parseDayStatus(null).ok, "no reply is not a state");

check(closeErrorFromMessage('Close Fiscal Day Request Failed: {"fiscalDayClosingErrorCode":"ReceiptsWithValidationErrors"}') === "ReceiptsWithValidationErrors", "error code from a close failure message");
check(closeErrorIsPermanent("ReceiptsWithValidationErrors") && !closeErrorIsPermanent("CountersMismatch"), "only a validation-error close is permanent");

// The device's GetInvoice matched a different receipt for an unknown number (suffix match).
check(!deviceInvoiceNoMatches("29025-FIS00000002-50-1", "doesnotexist-1"), "loose GetInvoice hit is rejected");
check(deviceInvoiceNoMatches("29025-HU0001", "HU0001"), "device prefix + our number matches");
check(deviceInvoiceNoMatches("HU0001", "HU0001"), "bare number matches");
check(!deviceInvoiceNoMatches("29025-XHU0001", "HU0001"), "a longer number ending the same way does not match");
check(!deviceInvoiceNoMatches("", "HU0001"), "empty reported number does not match");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
