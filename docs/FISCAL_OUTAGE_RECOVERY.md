# Outages, stale days, the clock and the shop queue

How the system behaves when ZIMRA or a device is unreachable, how it recovers, and what was actually checked.
Written 2026-11-06 from the code and from live runs on the ZIMRA test gateway.

## What the people at the tills and the shop see

Nothing. A sale or a paid shop invoice is always accepted and kept. Whatever cannot reach ZIMRA is queued and
sent by itself when ZIMRA is back. The fiscal state is an administrator's concern (Fiscal day, Central device).

## One door

`lib/fiscal/issue.ts`

| Call | For | Returns |
|---|---|---|
| `issueFiscalDocument({ kind: "pos", saleId })` | a till sale | `FISCALISED`, `QUEUED` or `REVIEW` |
| `issueFiscalDocument({ kind: "shop", invoiceId })` | a paid shop invoice | the same |
| `runFiscalQueues()` | the cron (`/api/cron/pos-queue`, every minute) | both queues in one pass |

It never throws because ZIMRA or a device is having trouble. `REVIEW` means a person must look: the data is wrong
(no lines, a ZIMRA validation code, a bad HS code or buyer TIN), or it has failed for too long.

## Sales from an earlier day

A sale held back by an outage is fiscalised by the queue as soon as the device is reachable and its day is open,
whatever day it was sold. ZIMRA records it in the fiscal day that is open at that moment. Our own record keeps the
day it was really sold. Nobody approves anything. (The 30 day limit on how old an offline till sale may be when it
syncs is separate and still applies.)

## A multi-day outage: close the stale day, open a new one, retry the invoices

ZIMRA gives each device a maximum day length (`taxPayerDayMaxHrs` from GetConfig, usually 24 hours). Past it ZIMRA
stops taking receipts.

**Fiscal service backend** (`fiscal-service/src/engine/scheduler.ts`), per scheduled device, every 30 seconds:

1. A day open longer than the limit minus 1 hour is closed even if the schedule did not ask.
2. A new day is opened straight away. If that fails it is retried at any hour.
3. A scheduled close stays owed across midnight until it is recorded, using the weekday of the day that is owed.
   A day opened after the owed close time is never closed by an old, missed close.
4. If ZIMRA refuses the close because the day is too old, the event says to close it on the ZIMRA portal. The new
   day then opens by itself.
5. The till's waiting sales were kept as saved invoices ("no day open" and "day closing" are retried, not failed)
   and are resubmitted by the queue once the new day is open.

**Legacy device backend** (`lib/services/fiscalSchedule.service.ts`): the scheduled close keeps retrying until it
succeeds (every minute for 5 hours, then every 10 minutes), across midnight; and the queue opens the day when sales are
waiting and the device is set to open automatically (`openDayForWaitingSales`).

A device whose open day was **not opened by this service** (for example opened by another tool) is refused by design:
its receipt counters are unknown, so the service cannot use or close it. Close that day on the ZIMRA portal.

## The clock

`lib/clockSkew.ts`. Every reply from ZIMRA carries a `Date` header; `zimraRequest` learns the offset from it (the
fastest reply wins; an estimate older than 30 minutes is dropped; impossible values are ignored). The app's scheduler
uses ZIMRA's time when the difference is 2 seconds or more. A difference of 30 seconds or more raises one alert a
day. The fiscal service already signs receipts with its own server-corrected clock.

## Shop invoices

A paid shop invoice goes through `issueShopInvoice`. On trouble it is queued: retry after 1, 2, 5, 10 minutes, then
every 30 minutes, up to 50 attempts, then `REVIEW` with an alert. Retries wait until the device is reachable with a day
open and open the day when it is set to. Only invoices the payment flow handed over are queued; an admin's drafts
are never touched. With `FISCAL_BACKEND=service` shop invoices go through the service on the central device
(`FISCAL_SERVICE_CENTRAL_DEVICE_ID`). The central device's close preview counts them.

Not covered yet: credit and debit notes for shop invoices through the service (they go to `REVIEW` with a clear
message) and the duplicate credit-note logic in the admin invoices route.

## What was checked, and where

| Check | Result |
|---|---|
| `cd fiscal-service && npm test` (real engines, fake ZIMRA, MongoDB) | 140 pass, including a three-day outage |
| `npx tsx scripts/test-service-backend.ts` (app to service) | all pass, including an earlier-day sale and a shop invoice through an outage |
| `npx tsx scripts/test-shop-fiscal.ts` | 33 pass |
| `npx tsx scripts/test-close-schedule.ts`, `test-clock-skew.ts`, `test-permissions.ts` | 10, 10, 12 pass |
| **Live, real ZIMRA test gateway**, device 32160: `npx tsx scripts/recover-live.ts "<certs root>" 32160 --yes` | PASS: day 31 closed, day 32 opened, a receipt fiscalised in it, day 32 closed |
| Live, device 31591 | day 72 was opened by something else, so it was refused as designed; close it on the portal |
| Axis virtual device `140.82.25.196:10005` (`npm run pos:simulate`) | could not run: the device answered "License Status: pending" to every receipt (renew the licence in its Fiscal Cloud account). The app kept all 24 sales as saved invoices with that reason, none lost |

## Running the live check yourself

```
cd fiscal-service
npx tsx scripts/recover-live.ts "<folder that contains certificates_<id>>" <deviceId>          # read only
npx tsx scripts/recover-live.ts "<folder that contains certificates_<id>>" <deviceId> --yes    # runs the recovery
```

Use a TEST device that is closed and clean. It registers the device in a throw-away database, sells two receipts
and leaves the device closed (add `--keep-open` to leave the new day open).
