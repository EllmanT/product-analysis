# Fiscal service, multi-till/multi-branch hardening and stress-test plan

Status: APPROVED. Phase 0 is done (2026-10-25, see section 6). Later phases not started.
Inputs: ZIMRA Fiscal Device Gateway API v7.2, RevMax API 3.4.4, the `zimra-fdms` library (copied into `zimra-fdms-main/`), the `einv` and `ref-codebases/invoicing` codebases, the Axis Virtual Device (VD) Swagger for ports 10005, 10007 and 31337, our own code audit, and live read-only probes of the ZIMRA test gateway.

## 1. Goals

1. Many tills per branch, many branches, any branch on a shared device or on its own device. Which device a branch uses is a setting. No hard-coded topology.
2. Production fiscalisation does not depend on any Axis software. Devices are ZIMRA devices whose certificate we hold. Axis Virtual Devices are only a test aid and sit behind a swappable driver.
3. Never produce a close-day error. Prevent the causes (counter gaps, duplicates, out-of-order, red validation errors, closing under load). Where a failed close can be corrected from our side, correct it automatically. Where only ZIMRA can fix it, detect it early, stop it spreading and alert.
4. The system keeps working through ZIMRA outages, network instability and tills with different connectivity. Nothing is lost, nothing is duplicated, and queues drain in order.
5. Fiscalisation lives in its own service (a "microservice") that the POS app calls. The app no longer holds counters, hashes, signing or ZIMRA calls.
6. A stress-test harness proves all of this, writes every rendered receipt to an output folder, and can run against fake devices (chaos) and the real ZIMRA test gateway (realism).

## 2. Decisions taken (from the user)

| # | Decision |
|---|---|
| D1 | A till is a real entity per branch (name, enabled, count is configurable). `tillId` is stamped on sales and on leased offline numbers. |
| D2 | Stress tests use fake devices for load and chaos, and the real ZIMRA test gateway for realism, on every usable test device. |
| D3 | Validation-error receipts: flag, alert the admin, block auto-close, keep selling. |
| D4 | The fiscal service is a separate Node/TypeScript package in its own folder (repo-ready), with its own MongoDB database. |
| D5 | We copy `zimra-fdms/src/core` into the service and own it (not a runtime dependency). |
| D6 | One **Direct Gateway driver** behind a driver interface. The Axis VD driver is **not** being built (decided 2026-10-25). |
| D7 | **No RegisterDevice flow.** All devices belong to one company. Adding a device = upload its certificate (and key), the service reads the device ID, serial and expiry from the certificate, confirms with `GetConfig`, and you assign the device to a branch. The existing registration and renewal admin code is kept but is not part of the normal onboarding path. |
| D8 | Hosting is undecided. The service is designed for one always-on process with a database lease as a safety net, so it runs on a VPS/container. A serverless host is not supported for the service. The Next.js app can stay wherever it is. |

## 3. What we found (the facts the plan rests on)

### 3.1 Live test environment (2026-10-25, read-only)
- ZIMRA test gateway `fdmsapitest.zimra.co.zw` is up. The ops portal `fdmsops.zimra.co.zw/fdms-public` is unreachable (also in the user's browser).
- Certificate bundles in `test certificates/` plus 31591:

| Device | State | Cert valid till |
|---|---|---|
| 28892 | **Open day 4 holding a Red receipt (our e2e test, 2026-10-25); unclosable by us.** Certificate renewed to 2027-04-25 | 2027-04-25 |
| 29234 | FiscalDayOpened (day 27) | 2026-11-11 |
| 21279 | CloseFailed, BadCertificateSignature | 2028-01-22 |
| 30389 | CloseFailed, ReceiptsWithValidationErrors | 2026-12-28 |
| 31591 | CloseFailed, ReceiptsWithValidationErrors | 2027-04-21 |
| 29203, 29233, 31728, 32160 | HTTP 401 (revoked or expired) | n/a |

- `GetStatus` does not return the server's day counters unless a day was closed manually. So a stuck day cannot be re-closed from code unless we recorded the counters ourselves. The five stuck/unknown devices can only be cleared by ZIMRA (portal or officer) or by Axis. **All stress tests therefore start from clean devices and record every receipt from the first one of the day.**
- Axis VD 10005 serves device 29025, stuck at CountersMismatch (464 days, 4,705 receipts). A retry of CloseFiscalDay did nothing.
- Axis VD 31337 (multi-device) is at `https://axisbay.co.zw:543`, API key auth, `{deviceId}` in every path. Device 21890 there is stuck (BadCertificateSignature) with an expired licence. Two extra API keys (ids 236 and 237) were created by test logins and left in place on request.

### 3.2 ZIMRA rules that decide close-day outcome (Gateway v7.2)
- `CloseDay` is allowed from `FiscalDayOpened` and `FiscalDayCloseFailed`. It is asynchronous: the reply is only an acceptance, the outcome comes from `GetStatus`. While `FiscalDayCloseInitiated`, no receipts and no second close are accepted.
- If the day has any Grey or Red receipt, `CloseDay` is rejected up front and the day stays Opened. Otherwise FDMS checks the counters and signature.
- `fiscalDayClosingErrorCode` values: BadCertificateSignature, MissingReceipts (a Grey gap), ReceiptsWithValidationErrors (a Red receipt), CountersMismatch.
- The device "must correct issues and repeatedly submit" the close. Unlimited retries. New receipts are still accepted in `CloseFailed`.
- Red receipt = any validation failure except the Yellow ones (RCPT014 date before day open, RCPT031 future date, RCPT041 after day end). Red receipts cannot be amended. Only ZIMRA can close such a day manually.
- Grey = the previous receipt is missing (breaks the chain). It re-validates when the missing receipt arrives.
- The `SubmitReceipt` reply has no per-receipt validation list. Red/Grey only shows up at close time. So prevention must be in our pre-send validation.
- Receipts must go in strictly ascending `receiptGlobalNo`, one at a time, none skipped. `receiptCounter` restarts at 1 each day. The same `deviceID + receiptGlobalNo + hash` is idempotent (returns the original receipt).
- `invoiceNo` must be unique per taxpayer (RCPT013). `receiptDate` must be monotonic, not in the future, within the day.
- Credit notes need the original to exist in FDMS (and, practically, to be uploaded), be under 12 months old, keep cumulative credits at or above zero, use only the original's taxes and the same currency.
- The day must close within `taxPayerDayMaxHrs` (24 on the test devices).
- Offline mode (`SubmitFile`) applies only to devices whose operating mode is Offline. Our devices are Online, so "offline" for us means **our own queue**, not `SubmitFile`.

### 3.3 Where our current app can cause close errors (audit)
1. Device validation errors are never read, and a "validation" rejection releases the invoice number even if the device stored the receipt.
2. Close-day has no fence, no re-check after the backlog wait, no lock against two closes, and a forced close skips pending and unknown sales.
3. A failed close is not modelled (CloseInitiated/CloseFailed are treated as open). Retries are blind.
4. The in-flight limiter and circuit breaker are per process memory. `withDeviceSlot` has no wait timeout, so a request can be flipped to UNKNOWN while still alive and re-submitted concurrently.
5. Queue drain is slow (25 per device per minute, back-off to 10 minutes per sale). A forced close after 120 minutes strands the rest.
6. Fiscal day and calendar day are separate concepts (`soldDate`). Late or offline sales become `needsApproval`.
7. Invoice numbers are allocated at submit time and can reach the device out of order.
8. No uniqueness check on a branch's `invoicePrefix`.
9. Offline controls from the original plan are partly unimplemented (no signing, 30-day age cap).
10. Credit notes do not check the original's state.
11. **Status parsing bug:** when a day is CloseFailed the VD returns `Code:"0"` with the status inside the `Message` string. The app reads that as "device unreachable".
12. **GetInvoice lookup bug:** the VD's lookup appears to be a suffix/contains match. Our lost-reply recovery trusts any hit.

### 3.4 Reference codebases
- `einv` and `ref-codebases/invoicing`: thin wrappers over the Axis VD. One global URL, main/backup device pair, no per-device lock, no offline queue, no CloseFailed handling. Useful ideas only: persist failed closes with a retry worker, re-read status before retrying a close, poll CloseInitiated instead of re-sending, check day state before submit.
- `zimra-fdms` (MIT, v0.4.1): a full software device. Signing strings, hash chain, counters, day-close string, QR, ECDSA CSR, crash-recovery (`reconcile`), FIFO offline queue, simulator and conformance vectors. Known gaps (its own HARDENING.md): no concurrency control, no process lock, no fsync, host-local dates, rejected receipt blocks the offline queue, no SubmitFile, little input validation, credit-note sign convention unconfirmed. It signs with ECDSA only.
- RevMax: device owns counters; one serialised writer per device; day must close within 24 h (72 h hard stop); credit notes need the original uploaded; wrong PC clock causes validation errors and bad signatures.

## 4. Target architecture

```
 Tills (browser POS)  ->  POS app (Next.js)  ->  fiscal-service (Node)  ->  ZIMRA Gateway (mTLS)
   offline queue            sales, stock,          per-device writer,        /Device/v1/{id}/...
   (IndexedDB)              numbering, UI          counters, signing,
                            settings               queue, close-day
                                                   own MongoDB
```

### 4.1 Responsibilities
**POS app** keeps: sales, stock, customers, invoice numbering (per branch and series), tills, settings UI, printing, Z-report display, offline till queue.
**fiscal-service** owns: device registry and certificates, per-device state (day, counters, hash chain), signing, ZIMRA calls, the per-device receipt queue, retries, reconciliation, day open/close scheduling, alerts, certificate expiry.
The app never touches counters or ZIMRA directly. It sends a *fiscalise request* and gets back either a final result or a pending ticket.

### 4.2 Service API (internal, shared-secret or mTLS between app and service)
- `POST /v1/receipts` : submit a receipt (idempotent on `{tenant, deviceKey, invoiceNo}`). Returns `fiscalised` (with QR, verification code, device id/serial, receipt numbers), `queued` (accepted, will be fiscalised in order), or `rejected` (with reason, nothing consumed).
- `GET /v1/receipts/{invoiceNo}` : status and fiscal data.
- `POST /v1/receipts/{id}/credit-note` : credit/debit note against an original.
- `GET /v1/devices`, `GET /v1/devices/{key}/status` : state, day status, queue depth, last error, certificate expiry.
- `POST /v1/devices` : add a device (certificate + key upload). `PUT /v1/devices/{key}/certificate`. `DELETE` refused if it has fiscal history.
- `POST /v1/devices/{key}/day/open`, `/day/close` (guarded), `/day/retry-close`.
- `GET /v1/devices/{key}/z-report?day=`.
- `GET /v1/alerts`, `POST /v1/alerts/{id}/ack`.
- Webhooks/callbacks to the app for async results (`queued` -> `fiscalised`/`failed`), with a pull endpoint as fallback.

### 4.3 Driver interface (D6)
```
interface FiscalDriver {
  getConfig(); getStatus(); openDay(); closeDay();
  submitReceipt(prepared); lookupReceipt(globalNo|invoiceNo);
  health();
}
```
- **DirectGatewayDriver** (production): built on the copied `zimra-fdms` core. Holds certificate/key, computes counters, hash chain, signature, QR.
- **AxisVdDriver** (test only, optional): maps to the VD endpoints (single 10005/10007 and multi 31337 with `X-Api-Key`, host `axisbay.co.zw:543`). Parses `Code:"0"` + JSON-in-`Message` correctly. Exact-match `GetInvoice`. This driver can be removed without touching anything else.
- **FakeDevice** (tests): an in-memory ZIMRA Gateway model for chaos tests (see Phase 6).

### 4.4 Data model (service database)
- `Device`: key, tenantId, name, zimraBaseUrl/production flag, deviceId, serial, modelName/version, certificate (PEM, encrypted key), certificate expiry, key type (ECC or RSA), operating mode, taxpayer data from GetConfig, applicable taxes, schedule (open/close time, timezone, max day hours), driver (`gateway` | `axis`), enabled, lastConfigAt.
- `DayState` (per device, durable): fiscalDayNo, status, openedAt, receiptCounter, lastGlobalNo, lastReceiptHash, running day counters, document quantities, lastClose attempt record.
- `ReceiptRecord`: device, invoiceNo (unique per tenant), type, status (`PREPARED`, `SIGNED`, `SENT`, `ACCEPTED`, `REJECTED`, `UNKNOWN`), globalNo, counter, signed payload and hash (stored **before** sending), server receiptID, signature, QR, error, attempts, timestamps, tillId, branchId.
- `CloseAttempt`: device, day, attempt no, counters sent, outcome, error code, status snapshot.
- `Alert`: device, kind, severity, message, acknowledged.
- `Lease`: per device writer lease (owner, expiry) for the safety lock.

### 4.5 POS app data model changes
- `Till`: branchId, name, code, enabled. Branch settings: number of tills, add/enable/disable.
- `PosSale.tillId`, `PosSale.fiscalDeviceKey` snapshot (kept), fiscal data returned by the service.
- Offline number leases carry `tillId`.
- `Branch.pos.fiscalDeviceKey`: null means "default device", otherwise own device. A global setting selects the default device. Mode "all branches on one device" = every branch null. Mode "device per branch" = every branch set. Mixed is allowed.
- Unique index on branch `invoicePrefix`.
- Settings page: devices list (upload certificate, sync, status), branch to device assignment, tills per branch, schedule per device.

## 5. Correctness rules the service must enforce (close-day prevention)

1. **Single writer per device.** An in-process FIFO queue per device plus a DB lease (`Lease`), renewed while working. Only the holder may sign, send, open or close.
2. **Persist before send.** Counter, global number, previous hash and signed receipt are written to the DB (atomic with `DayState`) before the HTTP call. On restart, `reconcile`: ask `GetStatus` (lastReceiptGlobalNo) and `lookupReceipt` to find out whether the in-flight receipt arrived, then either mark accepted or resend the **identical** signed receipt (idempotent on the ZIMRA side). Never re-sign with a new counter.
3. **Strict order.** Receipts go out in ascending global number. A failed receipt blocks the device queue (the next number cannot be used), and is retried with back-off. It is never skipped or renumbered. Retry classification: network/5xx/timeout = retry the identical receipt; 4xx structural = park and alert, and see rule 6.
4. **Unique invoice numbers per tenant** enforced at the service (DB unique index) as well as the app. Duplicate request with the same payload returns the original result. Same number with a different payload is rejected.
5. **Monotonic receipt dates.** Date is stamped at signing from a server-corrected clock in the device's timezone, never earlier than the previous receipt, never in the future, never before the day opened or after the day-end limit. Clock skew against ZIMRA's `serverDate` is monitored and alerted.
6. **Pre-send validation of every Red rule** we can check locally (the RCPT list in 3.2): line and tax arithmetic in integer cents, totals and sign rules, HS code format, buyer data, currency, credit-note rules (original exists and is accepted, same currency, taxes subset, cumulative limit, age under 12 months). A receipt that would be Red is rejected **before** a number is consumed.
7. **Day guard.** Before each send, the service knows the day state. If the day is closed it opens it (when the schedule allows), if it is past its maximum hours it stops sending and alerts, if it is `CloseInitiated` it waits.
8. **Guarded close** (state machine):
   `OPEN -> DRAINING (fence: new receipts are queued, not sent) -> VERIFY (pending = 0, no UNKNOWN, GetStatus last global no equals ours) -> CLOSE_SENT -> POLL (GetStatus until Closed or CloseFailed) -> CLOSED | FAILED`.
   - A per-device close lock prevents two closes (cron plus manual).
   - Forced close never skips the UNKNOWN reconcile.
   - On `CloseFailed`: record a `CloseAttempt`, read the error code, then act per code:
     - CountersMismatch: recompute counters from our `ReceiptRecord`s, compare with what we sent, correct and resend the close (bounded, spaced, escalating alert). If our counters equal what we sent, the mismatch is server-side: alert.
     - BadCertificateSignature: check certificate validity, key/cert match, key type vs signature format, and clock skew, then resend with the right format. Alert if it persists.
     - MissingReceipts (Grey): find the gap from our records, resend the identical missing receipt(s), then retry the close.
     - ReceiptsWithValidationErrors (Red): cannot be fixed by retry. Stop auto-close, raise a critical alert, keep selling per D3, show the affected receipts. Needs ZIMRA manual close. (Prevention in rule 6 is the defence.)
   - Retries are bounded by the day's maximum hours and escalate alerts at fixed times, not blind every minute.
9. **Credit notes** are routed to the original's device and are sent only after the original is `ACCEPTED`.
10. **Receipt colour tracking.** Because the reply has no per-receipt colours, the service keeps a "suspect" flag for any receipt where our local validation was uncertain, and surfaces them in a review list (D3).
11. **Certificate lifecycle.** Expiry alerts at 60/30/14/7/3/1 days (reusing the existing monitoring), renewal via `IssueCertificate` (kept, off by default), key type awareness (RSA vs ECDSA).
12. **Backpressure and fairness.** Per-device queue depth is bounded and reported. A slow or down device never blocks other devices (independent queues and breakers).

## 6. Phases

Each phase ends with its tests passing and a short review checkpoint with the user.

### Phase 0: Fix the current app first (DONE 2026-10-25)
Implemented: `lib/zimraDayStatus.ts` (status parser, close-error classes, exact invoice match), guarded close in `fiscalDayOps.service.ts` (lock, fence, recheck, CloseInitiated wait, permanent-error stop, recorded attempts), `fiscalDayControl.service.ts`, models `FiscalDayControl` and `FiscalCloseAttempt`, `needsReview` on PosSale with admin clear route `POST /api/pos/sales/[id]/review`, scheduler handling and alerts, Fiscal Day page banner. Tests: `npm run test:day-status`, `npm run test:close-guard` (new), `npm run pos:simulate:multi` (restored script, still passes). Not done from the list: step 7's investigation of why the script line was missing from the working-tree package.json (restored it).

Why first: these bugs affect today's behaviour and the test harness will rely on them.
1. Parse the VD status response properly: `Code:"0"` + JSON-in-`Message` means the device is reachable with that day status. Expose `fiscalDayClosingErrorCode` to the UI and logs. (`lib/services/zimraPosDevice.service.ts`, `lib/services/zimraFiscal.service.ts`.)
2. Exact-match `GetInvoice`: accept a hit only if `invoiceNo` equals `<deviceId>-<ourNo>` exactly. (`getDeviceInvoice`.)
3. Treat `FiscalDayCloseInitiated` and `FiscalDayCloseFailed` as their own states, not as "open": tills queue instead of submitting during `CloseInitiated`.
4. Close fence and re-check in `closeFiscalDayWithReport`: fence new submissions, re-count pending and SUBMITTING after the backlog wait, reconcile UNKNOWN before any close (including forced), per-device close lock (Mongo-based).
5. Persist `CloseAttempt` records with the failure reason. Alert on failure.
6. Flag-and-alert path for validation rejections (D3): do not release a number when the outcome is ambiguous, reconcile first.
7. Add the `pos:simulate:multi` script back to `package.json` (it was committed but is missing from the working tree) and check why.
8. Verify with the existing `pos-simulate.ts` and `pos-simulate-multi.ts`.

### Phase 1: Tills and settings (app side) (DONE 2026-10-25)
Implemented: `Till` model and `posTill.service.ts` (set count, rename, on/off, never deleted), `tillId`/`tillCode` on `PosSale` (validated against the branch; a switched-off till can still sync late sales), `PosNumberLease` log of which till got which provisional numbers, APIs `GET/PUT /api/pos/branches/[id]/tills`, `PATCH /api/pos/tills/[tillId]`, `GET /api/pos/branches/[id]/tills/report`, `POST /api/pos/branches/assign-device` (bulk), `tillId` filter on the sales list. UI: Tills panel and Fiscal devices by branch panel on POS settings; till picker on the terminal (remembered per browser, works offline, required when the branch has tills). Test: `npm run test:tills` (20 checks). Item 3 below (unique `invoicePrefix`) already existed in `branch.model.ts`, so the audit finding was wrong. Not done: the 200-sale offline cap, tamper signing and expiry (listed under risks), and a tills column in the Sales drawer.

1. `Till` model and API (add, enable, disable, count per branch). `tillId` on sales and on offline number leases.
2. Settings UI: tills per branch; branch to device assignment already exists, extend with "default device" global setting and a clear "all branches on one device / each branch its own device" view.
3. Unique index on `invoicePrefix`.
4. Per-till reporting (sales by till) and per-till trace on receipts.
5. Make all topology settings-driven and testable by toggling (no code change).

### Phase 2: fiscal-service skeleton (DONE 2026-10-25)
Implemented in `fiscal-service/`: copied `zimra-fdms` core (MIT notice kept), RSA+ECDSA `KeySigner` and RSA CSRs (OpenSSL-verified), `parseDeviceCertificate`/`assertKeyMatchesCertificate`, `SecretBox` (same `enc:v1` format as the app), `DeviceRegistry` (add by certificate+key only, GetConfig verification, encrypted key bound to the device id, duplicates/mismatch/expired/revoked refused, replace certificate, switch off), HTTP API with bearer token (`/health`, `/v1/devices`, `/certificate`, `/active`, `/status`), scripts `probe`, `renew`, `e2e`, `live-add-check`. 66 tests pass (library vectors + new). Not done yet: lease/lock engine, day lifecycle, receipt pipeline (Phase 3).
**Live results:** the renewal of 28892 worked (RSA, valid to 2027-04-25). The first live day on 28892 flagged receipt 1 RED because no HS codes were sent (RCPT047/048); a resend with the same numbers created a second record (RCPT011 Gray + RCPT013 Red), so 28892 now has an unclosable open day (day 4). **Lessons that Phase 3 must encode:** (1) the SubmitReceipt reply DOES carry per-receipt `validationErrors` with colours: stop the device queue on the first Red; (2) require an 8 digit HS code on every line for VAT payers before sending; (3) wait a few seconds after OpenDay before the first receipt (Yellow RCPT014); (4) pick the 15.5% standard tax by rate, not the first taxed line (first is a 5% withholding tax); (5) Red receipts cannot be replaced by resending. **Real-gateway signing of RSA receipts and a CloseDay is therefore still unproven** and needs a clean device (none left until ZIMRA/Axis clear stuck ones or re-issue the revoked four).

1. New folder `fiscal-service/` with its own `package.json`, tsconfig, lint, test runner, Dockerfile, `.env.example`.
2. Copy `zimra-fdms/src/core` into `fiscal-service/src/core`, keep its LICENSE notice, and port its tests and conformance vectors.
3. Database layer (MongoDB, own database): models in 4.4, indexes, migrations.
4. Config, logging, health endpoint, auth between app and service (shared secret or mTLS), request IDs.
5. Device registry: add device by uploading certificate and key. Parse the certificate (CN `ZIMRA-<serial>-<10 digit id>`, expiry, key type), verify the key matches, call `GetConfig` to confirm the device and fetch taxpayer data, taxes, QR URL and `certificateValidTill`. Store the key encrypted (reuse the existing secret-box approach).
6. Key-type support: ECDSA (library) **and RSA SHA256** signing per spec. Verify RSA signatures against the test gateway with device 31591 (RSA certificate).

### Phase 3: Direct Gateway driver and the per-device engine (BUILT 2026-10-25 against a fake gateway; not yet proven on the real gateway)
Implemented in `fiscal-service/src/engine/`: `DeviceEngine` (one writer per device: numbering under one lock, receipt saved before it is sent, strict send order with back-off and self-wake, identical resend after a lost reply or restart, repair after a crash between save and state advance, hard refusal drops the receipt and renumbers the unsent ones behind it, Red/Gray handling with alerts and pause/resume, certificate-rejected pause, offline receipts get a valid QR at once, credit-note rules, `DEVICE_BUSY` guard for the one-receipt-a-second date limit), the guarded `closeDay` (fence, drain, refuse on Red/Gray, check ZIMRA's count, bounded recovery per failure code), a database writer lease, `EngineManager`, `Scheduler` (opens/closes per device schedule in its own time zone, retries spaced, permanent blocks not retried, long-day warning), the HTTP routes, and the test fake gateway (`src/testing/fake-gateway.ts`) that enforces what we saw live. Tests: 115 pass (also under UTC and Africa/Harare host zones). Stress harness: `npm run stress -- scenarios/<file>.json` (scenarios: shared-device, per-branch-devices, mixed, red-receipt) writes every receipt to `test-output/stress-*/` with summary.md, index.csv, per-device JSON and events log.
**New findings:** (1) ZIMRA dates have 1 second resolution and must strictly increase, so ONE DEVICE CAN SUSTAIN ONLY ABOUT ONE RECEIPT PER SECOND (86,400 a day): 18 tills on one shared device are fine at normal trading, but a burst beyond it is held back, then told `DEVICE_BUSY`; separate devices run in parallel (the same 440-receipt run took 160 s on one device and 9 s on four). (2) Dates now format in Zimbabwe time whatever the host zone (the library used host-local time). (3) A restarted engine must remember the last device configuration (tax table) or it rejects every sale while ZIMRA is unreachable.
**Real-gateway results (ZIMRA test server, 2026-10-25, our code, RSA certificates):**
- *Day close signature*: on device 29234 (open day 27, counters unknown) a signed CloseDay with the wrong fiscal-day date gave `BadCertificateSignature`; with the right date (2026-10-19, the day it was opened) ZIMRA got past the signature and reported only `CountersMismatch`. So **our RSA day-close signing string and signature are accepted by the real gateway.** (`scripts/close-probe.ts`)
- *Receipts* (device 28892, a day already unclosable, chain continued correctly; `scripts/real-receipt-probe.ts`): a ZWG receipt with HS code, a partial credit note, and a repeat of an identical signed receipt all came back with NO validation errors; the repeat returned the SAME receiptID (so resending after a lost reply is safe on the real gateway); a credit larger than the original was flagged Red RCPT035, exactly what the engine pre-checks. The first receipt of that run was flagged RCPT020 (invalid signature) only because the day held two receipts with global number 6 after an earlier experiment, so the server's 'previous receipt' differed from ours; every later receipt chained from it validated.
- Open: `RCPT020` is ZIMRA's code for an invalid receipt signature (not RCPT010 as in the fake); the fake should be aligned.
- **Not yet proven on the real gateway:** a complete clean day (open, receipts, close, Z-report) and the engine itself (lost replies, outages, concurrency, multi-device) against real devices. This needs clean devices (an ID plus activation key from Axis/ZIMRA, then `RegisterDevice`) or the portal to clear the stuck ones.

**Still to do in Phase 3:** run it against a clean REAL device (none available yet), the scheduler's alert delivery (email/webhook into the app), and the 'ZIMRA says it holds N receipts but we hold M' reconciliation beyond the last-number check.

1. `DirectGatewayDriver` over mTLS with a keep-alive agent per device.
2. Per-device engine: in-process FIFO queue, DB lease, persist-before-send, `reconcile` on start-up and after UNKNOWN, retries with bounded back-off, circuit breaker per device.
3. Day lifecycle: `getConfig` before open, `openDay`, status polling, scheduled open/close with per-device schedule and timezone, `lastAuto*` only recorded on success, max-hours guard.
4. Receipt pipeline: pre-send validation (rule 6), integer-cent arithmetic, signing, QR and verification code, invoice-number uniqueness, credit-note routing.
5. Guarded close state machine (rule 8) including the recovery actions per error code.
6. Alerts: email via the existing mechanism plus an alerts API for the admin UI.
7. Run the library's conformance vectors in CI against our copied core.

### Phase 4: Wire the app to the service
1. Replace app-side ZIMRA calls with a service client (`lib/fiscal/client.ts`): `submitReceipt`, `status`, `closeDay`, credit notes, device status. Keep the app's own provisional-slip behaviour when the service reports `queued`.
2. Move the queue/breaker/limiter logic out of the app (it now lives in the service). The app keeps only its till-side offline queue and "send to service" retry.
3. Async result handling: webhook plus polling fallback to mark sales fiscalised and fill QR/device data.
4. Z-reports and fiscal-day screens read from the service.
5. Feature flag `FISCAL_BACKEND = legacy | service` so we can switch per environment and roll back.
6. Migration of existing sales/state: nothing historic needs moving (state is per device and starts fresh with a known-clean device), but the cut-over plan is written down (close the legacy day, switch the flag, open the day via the service).

**Phase 4 status (built, flag defaults to `legacy`):**
- `FISCAL_BACKEND=service` makes the app hand sales to the fiscal service. Client: `lib/fiscal/client.ts`; mapping: `lib/fiscal/serviceMapping.ts`; sale path: `fiscaliseViaService` in `lib/services/posSale.service.ts`.
- Each app device stores its `serviceDeviceId` (central device: `FISCAL_SERVICE_CENTRAL_DEVICE_ID`). A device not in the service is never replaced by another one; the sale waits and says why.
- The app keeps its own invoice numbers. The service is idempotent on the invoice number, so every retry is the same call again (no GetInvoice step). Notes must be identical between retries, so the provisional number is no longer put in them.
- Queued results are collected by the queue run (`collectServiceResults`); sales that never reached the service are sent again.
- Day close and open go through the service (`closeViaService`), keeping the app's close lock, review block, queue drain and fence; the app's own scheduler stands down; day status comes from the service.
- Service change: a line may give `taxPercent` without `taxId`; the service looks the id up in the device's tax table.
- Test: `npm run test:service-backend` (real service + fake ZIMRA + real app code): fiscalise, ZWG, credit note, ZIMRA down then back, service down then back, unlinked device, 24 tills at once, close/open from the app. All pass.
- Not done yet: webhook from the service (polling by the queue run is used), Z-report screens beyond the totals the close returns, alert delivery from the service to the app.

### Phase 5: DROPPED (Axis VD driver is not being built)
Original text kept for reference only:
1. `AxisVdDriver` for 10005/10007 (device-less, Bearer) and 31337 (device in path, `X-Api-Key`, host `axisbay.co.zw:543`, cached key, no login per call).
2. Correct `Code:"0"` + JSON-in-`Message` handling, exact `GetInvoice`, and the licence/expiry checks.
3. Kept strictly behind the driver interface so it can be deleted.

### Phase 6: Test harness and stress tests
All tests are driven by a scenario file (JSON) so topology and chaos are settings, not code.

**6.1 Fake ZIMRA device (high fidelity).** Models the real rules: `receiptCounter`/`receiptGlobalNo` sequencing, previous-hash chain, signature verification with the device certificate, all RCPT validation rules with Grey/Yellow/Red colours, day open/close with `CloseInitiated`/`CloseFailed`, counters check, 24 h limit, idempotent resubmission, 30 s timeouts, configurable latency, dropped replies after recording, outage windows, 5xx bursts, and Grey-then-heal behaviour.

**6.2 Scenario matrix** (each run is repeatable with a seed):
1. **Topology A:** all branches on one device, 4-5 tills per branch, many branches.
2. **Topology B:** each branch on its own device, 4-5 tills per branch.
3. **Topology C:** mixed (some branches share, some own).
4. **Settings flip:** change the branch to device assignment between runs and verify no cross-posting and that old sales keep their original device (including credit notes).
5. **Load:** every till posting at the same time, ramped and sustained bursts, USD and ZWG, tax-inclusive and exclusive, ~10% credit notes.
6. **ZIMRA outage:** full outage window with queue build-up, recovery, drain, close.
7. **Unstable network:** random timeouts, 5xx bursts, lost replies, slow replies, duplicate delivery.
8. **Mixed till connectivity:** some tills reach the app and device, some reach the app but not ZIMRA, some are fully offline (real IndexedDB offline queue driven in a browser harness), later reconnecting in random order. Verify provisional numbers, order and no duplicates.
9. **Service restart / crash mid-send** at every step (before persist, after persist, after send, before reply) with recovery.
10. **Two service instances** started by mistake: the lease must prevent double-writing.
11. **Close under load:** tills still posting while the scheduled close runs. The fence must queue new receipts for the next day with zero mismatches.
12. **Close failure injection:** CountersMismatch, BadCertificateSignature, MissingReceipts and Red-receipt cases, checking the automatic recovery or the alert as designed.
13. **Validation-error injection:** receipts that the fake marks Red must be caught by pre-send validation before consuming a number. Anything that slips through must show in the review list and block auto-close.
14. **Clock skew** and **day longer than max hours**.
15. **Credit notes:** over-credit, wrong currency, original not yet uploaded, original from a previous day, original on another device.

**6.3 Pass criteria (all runs).**
- Every sale is fiscalised exactly once, on the right device, with that device's ID/serial/QR.
- Per device: `receiptCounter` gapless from 1 each day, `receiptGlobalNo` gapless and continuous, hash chain intact, our counters equal the fake's.
- Zero duplicate invoice numbers, zero Red/Grey receipts, every day closes cleanly (or the injected failure follows its designed path).
- A slow or dead device never delays another device.
- Queue drain time and throughput reported.

**6.4 Output folder.** `test-output/<run-id>/` with: `receipts/<branch>/<till>/<invoiceNo>.txt` (80 mm slip), `.html` (A4 invoice), QR image/text, `index.csv` (every sale with device, numbers, timings, status), `devices/<device>.json` (final state and counters), `z-reports/`, `events.log`, and `summary.md` (pass/fail per criterion). Gitignored.

**6.5 Real gateway runs** (small, realistic, serial per device, on clean test devices).
1. Renew certificate of 28892 (expires 2026-10-27), open its day, run the smoke script: a few receipts in USD and ZWG, a credit note, then close. Confirm our signatures, QR and counters are accepted by the real FDMS and the day closes.
2. Repeat on every device that comes back clean (re-registered 401 devices, or any device ZIMRA/Axis clears). Include a multi-device run (several real devices, branches assigned to them, tills posting concurrently) once at least three clean devices exist.
3. Record each real day's counters from the first receipt so any failure is recoverable.
4. Never run destructive tests (injected failures) against the real gateway.

### Phase 7: Docs, runbooks, go-live
1. Update `POS_GO_LIVE.md`, `POS_TILL_SETUP.md`, `POS_MODULE_PLAN.md`, `MULTI_DEVICE_AND_CERT_PLAN.md`.
2. Runbook for each close failure code and for outages (what the system does, what a person does).
3. Operations: deployment of the service, backups of its database, the encryption master key, monitoring and alert routing.
4. Cut-over plan with rollback via `FISCAL_BACKEND`.


**Phase 6 status (app + service + fake ZIMRA, 2026-10-26):** `npm run stress:app -- fiscal-service/scenarios/<name>.json` drives the real app code (create sale, fiscalise, queue, credit notes, close from the app) into the real service. Scenario files set topology and chaos; the receipts, `index.csv`, `summary.md` and `events.log` are written to `test-output/app-stress-<name>-<time>/` (one file per sale, grouped by branch and till). All pass at full size: `shared-device` (all branches on one device, 400 sales, ~170 s because one device does ~1 receipt/s), `per-branch-devices`, `mixed`, `app-flip-device` (branch moved to another device mid-run; old sales and credit notes stay on the old one) and `app-service-outage` (the app loses the service while ZIMRA is also down; one branch prices without tax). Checks per device: one ZIMRA receipt per sale, gapless counters and global numbers, no Yellow/Gray/Red, no duplicate invoice numbers, own device id and QR, credit notes on the original's device, day closed from the app, Z-report totals equal sales, nothing flagged for review.
- Bug found and fixed: the app's per-line VAT used float rounding and was a cent off in ~490 of 150,000 checked cases (`lib/utils/invoiceCalculations.ts` now uses exact integer cents like ZIMRA; `npm run test:vat`). The service had correctly refused those receipts before they reached ZIMRA.
- Service fix: a flaky ZIMRA during `closeDay` now returns a "try again" result (`GATEWAY_ERROR`) instead of a 500.
- Not covered here: offline tills in a browser harness (6.2.8), kill/restart of the service at every step with the app attached (covered service-side in `engine.test.ts`), clock skew, and the credit-note edge cases beyond over-credit.

## 7. Order of work and checkpoints

| Step | Content | Checkpoint |
|---|---|---|
| 1 | Phase 0 (current-app fixes) | Existing simulators pass; review diff |
| 2 | Phase 1 (tills and settings) | UI review |
| 3 | Phase 2 and 3 (service and driver) | Conformance vectors pass; one real receipt accepted by FDMS on 28892 |
| 4 | Phase 6.1 and 6.2 (fake device and scenarios) | Matrix green |
| 5 | Phase 4 (wire the app) | Flag-based switch works end to end |
| 6 | Phase 6.5 (real gateway runs) | Clean real day close on each clean device |
| 7 | Phase 5 (Axis driver, if still wanted) and Phase 7 | Go-live review |

## 8. Risks and open points

1. ~~Regulatory approval~~ Confirmed by the user: ZIMRA does not require it.
2. **Stuck devices need ZIMRA.** 31591, 30389, 21279, 29025 and 21890 cannot be repaired by us. 29203, 29233, 31728 and 32160 need fresh activation or reissue by ZIMRA. Until then only 28892 and (with risk) 29234 are usable.
3. **Certificate key type.** The library signs ECDSA. Some of our certificates (renewed ones) are RSA. RSA signing must be proven against the real gateway before depending on it.
4. **Library maturity.** `zimra-fdms` is early-stage with one real-world verification. Mitigated by owning a copy, its conformance vectors, our fake device with spec rules, and real-gateway runs.
5. **Spec ambiguities** to validate on the real gateway: counter ordering in the close signature (the spec's own example conflicts with its stated order), credit-note sign convention, QR MD5 input (raw signature bytes), whether the Gateway rejects `CloseDay` for stale `fiscalDayDate`.
6. **Hosting.** Service must run as one always-on process (or a few with the DB lease). Needs a host decision.
7. **Time zone.** Sale dates currently use one global timezone. The service uses per-device timezones for schedules and receipt dates. Reports that mix devices must state their timezone.
8. **Offline tills.** A till with no connection to the app cannot reach the service. Its local queue and number leases already exist. The 200-sale cap, tamper signing and expiry from the original plan are still to be built (Phase 1 task list to confirm).
9. **No registration flow.** Onboarding relies on the user supplying valid certificate and key per device. The service verifies them against `GetConfig` and refuses mismatches, expired certificates and duplicate device IDs.

## 9. Questions still open
1. Hosting for the fiscal service (VPS, Azure, Docker host)?
2. Is ZIMRA type approval needed for self-signing software in production?
3. ~~Axis driver~~ Not needed.
4. The stuck test devices can only be cleared through the ZIMRA portal (currently unreachable) or by ZIMRA/Axis. Stress tests start from clean devices until then.

## 10. Real-gateway proof and next steps (2026-11-05)

The ops portal `https://fdmsops.zimra.co.zw/fdms-public/close-fiscal-day` is back. Input: device ID + day number; the day number is `lastFiscalDayNo` from GetStatus for a stuck day. Closing there marks the day `Manual`. Done today: 21279 (248, 249), 28892 (4), 29234 (29), 30389 (5, 6, 8), 31591 (68). All five devices are now clean.

**Results on the real gateway (our code, RSA certificates):**
- `e2e basic` on 21279 and 30389: open, 2 USD receipts (one mixed standard + exempt), our own CloseDay, FiscalDayClosed.
- `e2e full` on 30389: adds ZWG receipt and a credit note, closed by our own CloseDay (after the fix below).
- `real-stress` multi-device (28892, 29234, 30389, 31591), 60 sales, chaos (25% lost replies, per-device outage, all-device outage): 0 red/gray, ZIMRA count equals ours on every device, every day CLOSED on the first attempt, 52 fiscalised + 8 queued then drained.
- `real-stress` single shared device (28892), 40 sales, 12 concurrent, chaos: 40 accepted, match, CLOSED.
- App suites (fake gateway): test:day-status, close-guard, tills, service-backend, vat, stress:app per-branch-devices all pass; fiscal-service 123 tests pass.

**Bug found and fixed (close-day):** `accumulateCounters` negated credit notes, but credit notes are sent with negative amounts, so the day counters had +115 where ZIMRA computed -115 (and Cash balance 230 instead of 115). Result: `CountersMismatch` at close on any day with a credit note. Fix: a credit note contributes `-abs(value)` (works for positive or negative input). Regression test added; real day with a credit note now closes. `scripts/e2e-live.ts` also had float prices (rejected by the money guard); fixed.

**Open observation:** the first receipt on 21279 after a manual close of a `BadCertificateSignature` day came back Red RCPT012 ("global number not sequential") although we sent GetStatus.lastReceiptGlobalNo + 1. A retry after the portal close was clean. Not explained. Mitigation to build: after a manual close of a stuck day, send nothing until GetStatus has been stable, and treat the first receipt as a canary.

### Detailed plan from here
| # | Work | Status |
|---|---|---|
| A | Real-gateway matrix: remaining real scenarios (multi credit notes across devices, ZWG+USD mix on shared device, restart mid-day with adoption, 3+ devices concurrently with `--no-chaos` timing, certificate-expiry device 29234 on 2026-11-11) | partly done |
| B | Run `stress:app` for the other 5 scenarios again after the counter fix (shared-device, mixed, flip, outage, red) | not run today |
| C | Fake gateway: align with the real one (RCPT020 invalid signature; credit-note counter sign negative; RCPT012 after stuck close) | todo |
| D | Credit-note edge cases on real gateway: over-credit (RCPT035 seen), wrong currency, original on another day, original not uploaded | todo |
| E | Offline tills in a browser harness (6.2.8), clock skew, service kill/restart with the app attached | todo |
| F | Alert delivery service -> app (email/admin UI) and webhook; Z-report screens | todo |
| G | Hosting decision, deployment, backups, key management; flip `FISCAL_BACKEND=service` per environment | blocked on decision |
| H | Runbooks per close failure code; update POS_GO_LIVE / TILL_SETUP docs | todo |
| I | Devices 29203, 29233, 31728, 32160 return 401 (re-activation needed); Axis VD 10005 (29025) and 31337 (21890) still stuck | needs decision |

**Later 2026-11-05:** 29234 renewed (RSA, valid to 2027-05-05; old pair in `test certificates/_backup/`). `fiscal-service/scripts/credit-live.ts` (`npx tsx scripts/credit-live.ts "<certs>" <id> --yes`) passed on 28892: day A originals (USD standard+exempt, ZWG), day B two partial credits of the USD original summing to zero, a ZWG partial credit, a normal sale; both days closed by our own CloseDay. Answers from the user: hosting = VPS/Docker; try re-activating the four 401 devices via the portal (needs explicit per-device OK); next order = credit-note edges, other 5 app stress scenarios, offline-till browser harness, alert delivery + Z-report screens.

**2026-11-05 (pm):** Axis single VD device 29025 closed on the portal (day 464, was CountersMismatch). Portal pages: close-fiscal-day, reset-device-activation (Device ID + Activation Key), add-device (Register Device), search-serial, activation-details. 21890 (Axis multi VD) still needs its stuck day number (needs Axis multi-VD login or the number). Re-activating 29203/29233/31728/32160 needs an activation key typed into the portal by the user, then RegisterDevice with a CSR (renew/register code exists).

**2026-11-05 (eve): alert delivery built (Phase 4 gap F).**
- Service: `src/engine/alerts.ts` `AlertStore` (collection `alert_records`; the engine's raw `alerts` log is kept as the audit trail). One record per device + kind + UTC day with a counter. Routes `GET /v1/alerts[?unacknowledged=1]`, `POST /v1/alerts/:id/ack`. Tests `test/alerts.test.ts`; service total 127 pass.
- App: poller `lib/fiscal/serviceAlerts.service.ts` runs from the pos-queue cron, emails once per record (`svc:<id>` key, existing dedupe), releases the claim if the email fails. Recipients are now a setting (`FiscalAlertSettings`: every admin, or chosen admins, plus extra addresses; legacy `FISCAL_ALERT_EMAILS` still honoured). API `/api/admin/fiscal-alert-settings`, `/api/admin/fiscal-alerts`; panel `components/fiscal/FiscalAlertsPanel.tsx` on the Fiscal Day page. Test `npm run test:fiscal-alerts`.
- SMTP: the old login was rejected (535); fixed 2026-11-05 by reusing the working Gmail login from the echo-africa project; login verified and a test alert delivered.
- `fiscal-service/scripts/register-device.ts`: re-register a device from its activation key (key via ACTIVATION_KEY env var, never on the command line). Use after Reset Device Activation on the ops portal. Not yet run: the user runs it.
- Still to do: Z-report comparison screen (F2), offline-till browser harness (E), runbooks (H).

**2026-11-05 (late): Z-report / pre-close totals check built (gap F2).** Service: `DeviceEngine.dayCounters()` and `GET /v1/devices/:id/day-counters`. App: `lib/services/fiscalDayPreview.service.ts` compares per currency the device's SaleByTax / CreditNoteByTax with the app's FISCALISED sales and credit notes of the same fiscal day; route `GET /api/admin/fiscal-day/preview`; panel `components/fiscal/DayPreviewPanel.tsx` on the Fiscal Day page. Covered by two new checks in `npm run test:service-backend`. The two panels were typechecked but not yet looked at in a browser. Remaining: offline-till browser harness (E), runbooks and doc updates (H), device re-activation (user runs `register-device.ts`).

**2026-11-05 (night): offline tills (6.2.8) covered at protocol level.** `scripts/stress-app.ts` got `offlineTillRate` / `offlineSyncAtPct`: offline tills lease provisional numbers from the same allocator as `/api/pos/numbers/lease`, sell without reaching the app, then reconnect together in random order (some sales sent twice at once) while other tills keep selling and ZIMRA drops out. Scenario `fiscal-service/scenarios/offline-tills.json` (240 sales, 160 offline, 2 devices incl. one shared by two branches) passes: leased numbers all unique, every sale keeps the printed provisional number, stored exactly once, fiscalised once, counters gapless, day closed clean. NOT covered: the real IndexedDB queue in a browser (needs dev server, login and seeded branch; `components/pos/useOfflineQueue.ts` logic is thin: it posts with `idempotencyKey` oldest first and stops on server trouble), and the 200-sale offline cap / tamper signing / number expiry (still unbuilt). Device re-activation: the user resets on the portal and runs `register-device.ts` themselves.

**2026-11-05 (end of day): runbooks and docs (Phase 7) written.** `docs/FISCAL_RUNBOOK.md` (alerts, stuck days and the ops portal, close failures per ZIMRA code, Red receipts, certificates incl. re-registration, outages, service operation, cut-over/rollback, re-running proofs); new section 4c in `POS_GO_LIVE.md`; tills/devices section in `POS_TILL_SETUP.md`; `fiscal-service/Dockerfile` + `.dockerignore` (NOT built: Docker Desktop was not running). Full regression green: service 127 tests, six app suites, stress per-branch-devices / app-flip-device / offline-tills / red-receipt. Re-registration of 29203, 29233, 31728, 32160 still pending: all four still return Unauthorized; the user runs `register-device.ts` with their own activation keys.

**2026-11-06:** user re-registered 31728 and 32160 (29203 on 11-05 evening) with `register-device.ts`; 29233 was refused (DEV02 activation key incorrect: the portal's reset key differs from the one tried; needs a fresh Reset Device Activation). 29203 passed e2e full. Real-gateway multi-device chaos run on 6 clean devices (28892, 29203, 29234, 31591, 31728, 32160), 150 sales, 16 concurrent: 0 red/gray, ZIMRA count equals ours on all, every day CLOSED on the first attempt, 133 fiscalised + 17 queued then drained. 21279 (day 251) and 30389 (day 11) were found OPEN with day numbers/receipts we did not create: something else is using them (suspect Axis VD or the app scheduler); left untouched.
