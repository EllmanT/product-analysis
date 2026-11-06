# "Invoice not found" right after a sale, and closing the fiscal day safely

Written 2026-10-08. Reference for staff and developers.

## 1. What was observed

A POS invoice was fiscalised. Scanning its QR straight away said **"invoice not found"**, and the fiscal day showed the device as offline. A few minutes later, scanning the same QR showed **"invoice is valid"**.

I did not have the logs for that specific invoice, so section 2 is the explanation that fits the device's documented behaviour, not a confirmed diagnosis.

## 2. Why it happens

The ZIMRA virtual fiscal device works in two steps:

| Step | Who | When |
|---|---|---|
| 1. Sign the receipt, return QR + verification code | Device | Immediately (about 1 to 2 seconds). The reply message is `Fiscal Invoice Queued` |
| 2. Upload the signed receipt to ZIMRA FDMS | Device, in the background | As soon as it can reach ZIMRA |

The public verification page (the QR target) only knows a receipt after step 2. While the device cannot reach ZIMRA:

- the invoice is **valid and correctly signed**, and the slip is correct;
- the QR shows **"not found"**;
- when the device reconnects it uploads the backlog and the same QR becomes **valid**.

Nothing is lost or re-issued. Do not re-issue an invoice because a scan says "not found" in the first minutes.

Evidence from this codebase and the device:

- `docs/POS_MODULE_PLAN.md` §3.1: the device "signs on the spot and uploads to FDMS asynchronously" (`GetStatus.lastReceiptGlobalNo` lagged the responses, then caught up).
- The device's Swagger lists `GetUnProcessedInvoicesSummary`, `GetUnProcessedInvoices/{day}` and `...ByDate/{date}`: its own queue of receipts not yet uploaded.
- Device setting `taxPayerDayMaxHrs` = 24: the longest a fiscal day may stay open.

## 3. Is every invoice guaranteed to be found later?

**Not guaranteed by our code.** It is guaranteed only as long as the device keeps its backlog and can eventually reach ZIMRA. What we control is making sure we never act on a receipt, or close the day, while that is still unsettled.

The risk is closing the fiscal day while receipts are still waiting to upload. ZIMRA may then reject the close, and the day stays open.

## 4. What the code does now

| Concern | Mitigation | Where |
|---|---|---|
| Device unreachable when a sale is made | Sale is saved first, gets a provisional number and a provisional slip, and is retried every minute (same fiscal day), with backoff and a circuit breaker | `lib/services/posSale.service.ts` (`fiscalisePosSale`, `runPosQueue`) |
| Request times out and we do not know if the device got it | Sale is `UNKNOWN`; we ask the device `GetInvoice/{number}` before ever resubmitting, so no double receipt | same file |
| Device holds a number for a different, older receipt (this caused the wrong-QR bug) | Receipt is compared with the sale (total, currency, lines, number, QR). On mismatch the number is skipped, never printed | `lib/pos/fiscalMatch.ts`, `markFiscalised` |
| Unfiscalised sales from today when closing | Close is refused until they are fiscalised | `lib/services/fiscalDayOps.service.ts` (`countPendingPosSales`) |
| **Receipts the device has signed but not uploaded to ZIMRA** (new) | Before a normal close, the device's upload backlog is read (`GetUnProcessedInvoicesSummary` for the open day). The system waits up to 25 s for it to reach 0, otherwise refuses to send the close | `getDeviceUploadBacklog` in `lib/services/zimraPosDevice.service.ts`, `waitForDeviceUpload` in `fiscalDayOps.service.ts` |
| Scheduled close during an outage | Retried every minute for up to 120 minutes after the close time | `lib/services/fiscalSchedule.service.ts` (`CLOSE_DEFER_MAX_MIN`) |
| Sales from an earlier day | Never fiscalised silently into today; an administrator must approve | `fiscalisePosSale` (`needsApproval`) |
| Background jobs | `pos-queue` and `fiscal-schedule` run every minute (`vercel.json`) | `app/api/cron/*` |

Status of the new backlog check: it compiles and the device call was verified against the test device (backlog read 0 on fiscal day 461). It has **not** yet been exercised with a real backlog (see section 7).

## 5. Added later the same day (2026-10-09)

| Gap from the first version | What was done |
|---|---|
| No visible backlog | Admin > Fiscal Day now shows device state: not reachable, upload queue unreadable, "catching up: N receipts not yet uploaded", or "all receipts uploaded". Fed by `getDeviceHealth()` through `/api/admin/fiscal-day/status` |
| Forced close skipped the backlog and gave up silently | A forced close still waits up to 25 s for the backlog to drain (without blocking on it). If the forced close is refused, retries continue for 180 more minutes (`FORCED_RETRY_MAX_MIN`) |
| No alerts | Administrators are emailed once per day per problem (deduplicated in the `fiscalalerts` collection): close held back 30 minutes or more, and a forced close that still fails. Recipients: `FISCAL_ALERT_EMAILS` (comma separated) or, if unset, every admin user. Needs SMTP configured |

Files: `lib/services/fiscalAlerts.service.ts`, `database/fiscalAlert.model.ts`, `lib/services/fiscalSchedule.service.ts`, `app/(admin)/fiscal-day/page.tsx`.

## 6. Still open (honest gaps)

1. **Not tested with a real outage.** The test device is remote, so the ZIMRA connection cannot be cut from here. Procedure: ask the device provider to block its route to FDMS (or test while it is naturally offline), make 3 to 5 sales, restore, and confirm: the page shows the backlog, a close is refused with the backlog message, the backlog drains to 0, and the close then succeeds.
2. **Day age is not shown or alerted.** The device does not report when the day was opened, so we cannot yet warn as the 24-hour limit (`taxPayerDayMaxHrs`) approaches. Fix: record the open time when we open the day, and alert at 20 hours.
3. **Alert emails are untested** end to end (the deduplication was tested; real sending depends on your SMTP settings and was not triggered).
4. **Unreadable device.** If the device does not answer `GetStatus`, a normal close is refused ("cannot confirm"). This is deliberate. A forced close proceeds anyway.
5. **Close windows that cross midnight** (close time such as 23:30 plus the retry window) are not handled by the scheduler: its time comparison is within one calendar day. Pre-existing; keep the close time well before midnight.
6. **No daily reconciliation** of our fiscalised sales against the device's receipts and Z-report.
7. The 24-hour limit and ZIMRA's own acceptance of a close are outside our control.

## 7. Instructions for cashiers and managers

- "Not found" in the first minutes after a sale is **normal if the device shows offline**. Scan again later. Do not issue a second invoice.
- Before the evening close, look at Fiscal Day: it should say "All receipts uploaded to ZIMRA". If a close is refused for an upload backlog, wait a few minutes and retry.
- Never click force-close to get past a backlog message unless support says so.

## 8. Quick reference

| Question | Answer |
|---|---|
| Is a "not found" scan a bad invoice? | No. It is not yet uploaded to ZIMRA |
| Can an invoice be lost? | Not by our flow: sales are saved before the device is called and retried until fiscalised |
| What blocks a day close now? | Unfiscalised sales from today, or device receipts not yet uploaded |
| Where is the device's own backlog? | `GET /api/VirtualDevice/GetUnProcessedInvoicesSummary?fiscalDayNumber=<day>` |
| Where do I see the cause of a refused close? | The message returned by the close action (`POS_PENDING` in `app/api/admin/fiscal-day/close/route.ts`) and the cron log lines from `fiscal-schedule` |

## 9. Related files

- `docs/POS_MODULE_PLAN.md` (device behaviour measurements, §3.1)
- `docs/POS_GO_LIVE.md` (scheduler and acceptance run)
- `lib/services/zimraPosDevice.service.ts`
- `lib/services/posSale.service.ts`
- `lib/services/fiscalDayOps.service.ts`
- `lib/services/fiscalSchedule.service.ts`
- `lib/pos/fiscalMatch.ts`
- `scripts/pos-qr-collision.ts`, `scripts/pos-audit-qr.ts`
