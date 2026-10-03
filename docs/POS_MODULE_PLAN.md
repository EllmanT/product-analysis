# Multi-Branch Fiscal POS Module — Plan

Status: PLAN ONLY, nothing built yet. Decisions confirmed 2026-10-03: slip layout = `EpsonSlip - new-shop-online.rdlc`; printing = browser print with 80mm CSS (kiosk-printing); numbering = per branch+currency, continuous, consumed only on success; access = new `cashier` role + per-branch POS toggle.

## 1. What the desktop app does (reference: RevAccounting C#)

| Area | Desktop behaviour | Web equivalent |
|---|---|---|
| Entry flow | Product box (autocomplete) → Enter → Qty (default 1) → Enter adds line → focus returns to Product | Same, keyboard-first |
| Custom-price items | Names containing "various / switchgear / wiring / lighting kit" jump to the Price box instead of Qty | Make this a per-product flag `priceOnEntry` (replaces hard-coded keywords) |
| Ad-hoc item | "Other product" name → Enter → price → Enter → qty | Same, via F-key shortcut |
| Client | Combo (default "No Name" = CASH SALE); Enter moves to currency | Same |
| **F12** | Fiscalize + print from any field | Same, global |
| Currency | Combo USD/ZWG; switching reprices rows from stored base price × rate | Single toggle in header (e.g. F2); see §5 on repricing |
| Tax | `TaxMode 1` = VAT-inclusive prices; line VAT = total − total/(1+rate) | Same, config per branch |
| Totals strip | Two boxes: today's USD total, today's ZWG total (flat text file) | Live DB aggregate per branch per currency, plus counts |
| Invoice no | `{Prefix}{U|Z}{counter:D4}`, counter in a text file, incremented after success | `{branchPrefix}{U|Z}{0000}` from atomic Mongo counter |
| Receipt | ReportViewer `.rdlc`, `LocalReport.Print()`; printed fields include VerificationCode, QR, link, DeviceID, Serial, FiscalDay, ReceiptGlobalNo as "Invoice No", prefix number as "Customer reference" | HTML/CSS 80mm slip with the same fields in the same order |
| Day control | Auto open/close: startup check, 30s timer, idle close, shutdown close, weekend schedules, catch-up of unclosed prior day | Server-side (see §6) |

Things in the C# I will NOT carry over:
- **TransactionSimulator** pushes filler sales to ZIMRA when a shop is idle so the day never looks idle. On a production device that creates fiscal records with no real sale behind them. In the web build, "simulation" will exist only as a test tool locked to the ZIMRA test server and flagged as test data (§9).
- Hard-coded values in the slip: `15.50%` VAT label, `NetAmount = total / 1.155`, footer "www.amanat.biz / amanatelectrical.com", `ITEMCODE 99001000`. These become settings. **Need from you**: correct VAT rate (15% vs 15.5%) and the footer text per client.
- Flat-file state (counters, daily totals, fiscal_state.json). All move to MongoDB.

## 2. What exists in the web platform

- ZIMRA virtual-device client: `lib/services/zimraFiscal.service.ts` (GetConfig/GetStatus/OpenFiscalDay/CloseFiscalDay/SubmitReceipt), `fiscalSettings.model.ts` (one global device), `fiscalSchedule.service.ts` + `app/api/cron/fiscal-schedule` (auto open/close), Z-report model and pages.
- Invoice model with `lines`, `fiscalData`, `buyerSnapshot`; invoice numbers currently random `INV-USD-YYYYMMDD-XXXX` (not suitable for POS).
- Users already have `branchId` and `role: admin | branch_user`; `Branch` model exists; sidebar driven by `constants/constants.ts`.
- Gaps: no concurrency control around SubmitReceipt, no per-branch numbering, no POS UI, no cashier role, invoices are quotation-derived only.

## 3. The central technical risk: one device, many branches

### 3.1 Measured on the ZIMRA test device (2026-10-03, device 29025, fiscal day 461)

| Test | Result |
|---|---|
| 6 simultaneous SubmitReceipt (mixed USD/ZWG, 6 "branches") | All 6 accepted. Unique, contiguous `receiptGlobalNo` 4333–4338 and `receiptCounter` 25–30. No errors, no interleaving. |
| Latency | The device **serialises internally**, about 1.1 s per receipt. Concurrent callers wait in a staircase: 1.9 s, 3.0, 4.0, 5.2, 6.3, 7.4 s. Single receipt: 1.5–2.4 s. |
| Response message | `Fiscal Invoice Queued`, and it **already contains** QR URL, verification code, receipt hash/signature. The device signs on the spot and uploads to FDMS asynchronously (GetStatus `lastReceiptGlobalNo` lagged the responses by a few receipts, then caught up). |
| Duplicate `invoiceNo` | Second submit is rejected: `Invoice Number X already exist in your fiscal records` (Code 0). So **retries with the same number are safe**, they cannot double-fiscalise. The rejected retry does not return the original QR. |
| Wrong total | Rejected (`RCPT019 ... Invoice Amount must equal sum of line items`), so server-side totals must be exact. |
| Invoice number on the device | Device stores it as `{deviceId}-{ourInvoiceNo}` (e.g. `29025-HUMUSA1496`). |
| Tax table | Includes `Standard rated 15.5%` (taxID 517, valid from 2025-12-15). The platform's current default of 15 is stale and must change to 15.5. |
| Receipt date | Set by the device at submit time, not by us. A late submit gets a late date. |
| Lookup endpoint | **Found in the device's Swagger (`/swagger/v1/swagger.json`)**: `GET /api/VirtualDevice/GetInvoice/{invoiceNumber}` returns the full receipt, QR and verification code (works with our number or `{deviceId}-{number}`), or `Code 0 "not found in the device"`. This closes the ambiguous-timeout gap. Also available: `GetUnProcessedInvoicesSummary?fiscalDayNumber=` (device's FDMS upload backlog; 0 right now), `GetUnProcessedInvoices/{fiscalDayNumber}`, `...ByDate/{date}`. `ClearUnprocessedInvoices*` exist but are destructive, so we never call them. |

Side effect to be aware of: this testing created about 13 test receipts on test fiscal day 461 (global no 4323–4339 range), so that day's Z-report totals include them.

### 3.2 What this means for the race condition

- The **device-side** race (sequence numbers across branches) is handled by the device. We do not need to build a lock for sequence correctness.
- The races we **do** own: (1) our per-branch+currency invoice counter (atomic Mongo `$inc`, unique index), (2) double-clicks and client retries (idempotency key per sale), (3) timeouts when 6 branches submit at once (the 6th waits ~7 s, so the UI timeout must be 30 s+ with a clear "Fiscalising…" state), (4) the sale being saved before submit so a crash never loses a sale.
- Add a **concurrency limiter** in the server (e.g. 3 in flight) so a burst never queues more than the device's timeout allows; excess requests wait in our own FIFO.
- Capacity: about 50 receipts/min device-wide (1.1 s each). Six branches each selling every ~20 s is fine; sustained bursts above that queue.
- Number allocation: allocate when the sale is created (state `PENDING`), submit, set `FISCALISED`. If the submit definitively fails (Code 0 validation error) the sale is `FAILED` and the number is **reused**; if the outcome is unknown (timeout) the number is held until reconciled (§10.5). Duplicate-rejection is our reconciliation signal.

## 4. Data model

- `Branch` += `invoicePrefix` (e.g. `H`, `C`), `posEnabled`, `receiptHeader` (name/TIN/VAT/address/phone/email/logo), `receiptFooter`, `taxInclusive`, `defaultCurrency`.
- `InvoiceCounter { branchId, currency, seq }` unique on (branchId, currency); `$inc` atomic.
- `PosSale` (or extend `Invoice` with `source: "pos"`, `branchId`, `cashierId`, `currency`, `invoiceNumber` unique, `idempotencyKey` unique, `status: PENDING|FISCALIZED|FAILED|UNKNOWN`, fiscal data, printed count, reprint log). Indexes: (branchId, createdAt), (branchId, currency, fiscalDayNo).
- `ProductMaster` += optional `branchIds[]` (scope), `priceOnEntry`, `taxCode`, `hsCode`, separate USD and ZWG price (see §5).
- `User.role` += `cashier`. Auth guard helper `requireBranchScope()` that returns `branchId` for non-admins and is used by **every** POS query (never trust a branchId from the client).
- `AuditLog` for day open/close, reprints, voids, role/prefix changes.

## 5. Pricing (decided)

ZWG price = USD price × current rate (existing `exchangeRate.model.ts`), with an optional per-product ZWG override. VAT rate is configurable per branch, default **15.5%** (taxID 517 on the device). Currency is locked once the first line is added; switching mid-sale reprices all lines after a confirm. The rate used is snapshotted on the sale so reports never change retroactively.

## 6. Fiscal day for the shared device

Device has one fiscal day for all branches, so open/close is a **global** operation, not per branch.
- Reuse and harden the existing cron schedule: open at a configured time, close at a configured time, plus the desktop rules ported server-side: not before `EarliestCloseTime`, catch-up close of an unclosed prior day, weekend schedules.
- **Idle close is dangerous** with many branches (one quiet branch must not close the day). Idle = no sale from ANY branch.
- POS header shows device/day status; if the day is closed, F12 shows "Day closed" instead of failing silently. Admin can force open/close; closing blocks while a submission is in flight (use the same lock).
- State lives in MongoDB (replaces `fiscal_state.json`).

## 7. POS screen (route `/pos`, own minimal layout, no admin chrome)

```
┌ Branch · Cashier · Day status ●OPEN · Fiscal day #n ───── [USD | ZWG] ┐
│ Client [No Name ▾]                                                      │
│ Product [__________]  Qty [1]  Price [____]   (Enter adds)              │
│ ┌ line items ────────────────────────────────── Qty Price VAT Total ┐   │
│ │ …                                                                 │   │
│ └───────────────────────────────────────────────────────────────────┘   │
│ VAT 0.00   TOTAL 0.00 USD                          [F12 FISCALIZE]      │
│ Today · this branch:  USD n invoices $x   |   ZWG n invoices ZWG x      │
└─────────────────────────────────────────────────────────────────────────┘
```
Keys (kept from desktop): Enter on Product → Qty (or Price for `priceOnEntry`); Enter on Qty adds line and refocuses Product; **F12 fiscalize from any field**; Enter on Client → Currency. Additions: F2 toggle currency, F3 focus product, F4 client, F5 ad-hoc item, Del/↑↓ remove/select line, Esc clear sale (confirm), F9 reprint last.
UX rules: product search is local (cached list, instant), no modals for validation (inline errors), F12 disables itself while submitting and shows progress, success flashes and auto-prints, focus returns to Product. Design pass will use ui-ux-pro-max, emil-design-eng and impeccable per your standing rules.

Other pages: Today's invoices (branch scoped, reprint), branch day summary, admin all-branch view with branch filter, per-branch counts and totals by currency, product management scoped to branch.

## 8. Receipt and printing

- HTML/CSS slip, `@page { size: 80mm auto; margin: 0 }`, reproducing the `new-shop-online` layout: logo, FISCAL TAX INVOICE, company name/TIN/VAT/address/email/tel, buyer block, Device ID / Customer reference (= `HU0001`) / Invoice No (= ReceiptGlobalNo) / Date / Fiscal Day / Serial, items table (Description, Qty, Price, VAT, Total incl), VAT summary (VAT%, Net, VAT, Amount), Total + Currency, verification code + link + QR, thank-you footer.
- QR generated client/server-side with the `qrcode` npm package (small, no service).
- Print via hidden iframe `window.print()`; till PCs run Chrome with `--kiosk-printing` pointed at the slip printer for one-key silent printing. Provide a setup doc and a shortcut file. Reprints are logged and marked "DUPLICATE".

## 9. Security

- Auth on every POS route/API; branch scope derived from session only; cashier cannot reach admin pages or other branches' data (enforced in API layer + tests).
- Rate limiting and idempotency on fiscalize; Zod validation; server recomputes all totals and VAT (never trusts client amounts).
- No simulation endpoints in production: test tools gated by `ZIMRA_ENV=test` AND admin role, and test invoices carry `isTest`.
- Secrets (cert/PFX, passphrase) currently stored in `FiscalSettings` in plain fields: encrypt at rest and never return to client.
- Audit log, session timeout on idle till, CSRF-safe same-site cookies, optional per-branch IP allow-list.

## 10. Dependencies, outages and the unfiscalised-invoice queue

Minimal new dependencies: `qrcode` (and a small IndexedDB helper or hand-written wrapper). No third-party POS/print/SaaS services; Redis optional.

### 10.1 Three different "offline" cases (they need different answers)

| # | Failure | What still works | Fiscal QR available? |
|---|---|---|---|
| L3 | **Virtual device ↔ ZIMRA/FDMS down** | Everything. The device signs locally and returns QR + verification code, then uploads later (it said "Queued"). Device allows up to `taxPayerDayMaxHrs` = 24 h before the day must close. | **Yes.** Customer gets a normal fiscal slip. Nothing for us to queue. |
| L2 | **Our server ↔ virtual device down**, device errors, timeouts, or fiscal day closed | Till ↔ our server fine, so the sale is saved immediately | **No** |
| L1 | **Branch internet / our server down** | Only what the browser has cached | **No** |

L3 is the common ZIMRA outage and is already covered by the device. Only L1 and L2 need the unfiscalised queue. Ask Axis (device provider) how long the device keeps its FDMS upload queue and what it does at the 24 h limit.

### 10.2 Core design: "unfiscalised sale" as a first-class state

Sale lifecycle: `PENDING → FISCALISED` (normal) or `PENDING → UNFISCALISED → FISCALISED | VOIDED`.

- **L2:** the server never blocks the sale. If the device is unreachable/slow (> 30 s) or the day is closed, the sale is saved as `UNFISCALISED`, a provisional slip is returned, and the till prints it immediately.
- **L1:** the browser (service worker + IndexedDB) saves the sale locally, prints the provisional slip, and syncs it to the server when the connection returns. The app shell and product/price list are cached so the screen still loads and F12 still works.
- **Provisional slip** looks like the fiscal slip but: no QR, no verification code, header **"NOT A FISCAL TAX INVOICE — fiscal invoice to follow"**, own number series, buyer details printed so a later fiscal invoice can be issued.
- **Own number series** for provisional documents (e.g. `HUP0001` / `HZP0001`, or prefix + `X`) so the fiscal series `HU0001…` stays gapless. Offline tills cannot atomically take numbers from the server, so each till is leased a **block of provisional numbers** (e.g. 100) while online; blocks are unique per till, so no collisions offline. Unused numbers in a block are simply skipped (provisional series gaps are harmless; the fiscal series gaps are what matter).

### 10.3 Your question: re-push the original, or fiscalise as a new sale?

Findings that decide it:
1. **The device stamps the receipt date at submit time** (we cannot backdate). A late fiscalisation is therefore, to ZIMRA, a sale made *now*, possibly on a different fiscal day than the money changed hands.
2. The device enforces **unique invoice numbers**, so re-pushing the same sale with the same number is technically safe from double-counting. But the resulting fiscal invoice still carries the later date.
3. There is **no lookup**, so after a timeout we cannot ask "did it go through?" except by resubmitting (duplicate rejection tells us yes, but not the QR).

So technically "re-push" and "new fiscal sale" are the same thing at the device; the real difference is how the system **presents and controls** it. Recommendation (hybrid):

- Treat the provisional slip as a different document from the fiscal invoice and **link them** (`provisionalNo` stored on the sale and sent in `receiptNotes`, e.g. `Ref provisional HUP0007`). The later fiscal invoice gets the next number in the normal series (`HU0042`) and today's date. One sale, two documents, counted once in analytics.
- **Automatic retry queue** for L2 failures: background job retries with backoff (30 s, 1 m, 2 m, 5 m…) while the device is reachable and the day is open, **limited to the same fiscal day**. This handles brief outages with no staff action.
- **Manual "Fiscalise" button** on every unfiscalised sale (branch scoped), required for: sales older than the same day, sales whose buyer needs a fiscal invoice, anything the auto-queue gave up on. Shows a warning when the date will differ from the original sale date.
- Anything that would land on a **different fiscal day** than the sale needs admin approval, because it shifts revenue between Z-reports. Show it in an admin "needs attention" list.
- After fiscalising, optionally reprint the **fiscal invoice** for the customer (they already left with the provisional slip; they can collect or receive by email/WhatsApp, buyer contact is captured on the provisional sale when available).
- Alerts: a banner on the POS when unfiscalised count > 0; admin dashboard card with count and oldest age; email to admin if oldest > configurable threshold (e.g. 2 h) or if the day is about to close with unfiscalised sales (block auto-close until resolved or explicitly overridden).

### 10.4 Complications to design around

1. **Compliance/legal**: handing over a non-fiscal slip and fiscalising later may not be acceptable under ZIMRA rules for a registered device, or may be acceptable only within a limit (same day / 24 h). Must be confirmed with ZIMRA/the client before go-live. The design makes the limit configurable (e.g. auto/allowed window in hours).
2. **VAT/period**: the customer cannot claim input VAT until the fiscal invoice exists; late fiscalisation across a month end moves output VAT to the next period.
3. **Money vs fiscal totals**: the till's daily totals (cash taken) will exceed the fiscal day total until the queue clears. The POS totals strip should show **fiscalised** and **pending** separately per currency so the cashier reconciles correctly.
4. **Day close**: closing the fiscal day with unfiscalised sales for that day strands them. Close job must check the queue first (try to drain, then alert admin, with an explicit override).
5. **Price/exchange rate drift**: a ZWG sale fiscalised later must use the **original** snapshotted rate and amounts, not today's.
6. **Duplicates**: a sale must exist in exactly one fiscal receipt. Guard with the unique `invoiceNo` rule and by never allowing "Fiscalise" on a sale that is already `FISCALISED` or `SUBMITTING`. A manual click during the auto-retry must use the same invoice number so a race returns "already exist" instead of a second receipt.
7. **Ambiguous timeouts**: if a submit times out, the sale may be fiscalised on the device with us holding no QR. Retry with the same number: if the device answers "already exist", mark `FISCALISED_NO_QR` and flag for admin (QR must be recovered via the device provider or FDMS portal). Ask Axis whether a lookup endpoint or log export exists; this removes the gap.
8. **Offline tills and stock/price**: cached product list can be stale; accept and flag price differences on sync rather than rejecting a sale that is already handed to the customer.
9. **Sync conflicts**: offline sales sync with an idempotency key; server rejects duplicates; sale timestamp is the till's local time (stored as `soldAt`) and clock skew is recorded.
10. **Security offline**: IndexedDB contents must be limited (no tokens beyond the session, no ZIMRA credentials); sales stored locally are signed with a per-till key so tampering is detectable on sync; a cap on offline sales per till (e.g. 200) and an expiry (e.g. 24 h) before the till locks.
11. **Printing a QR**: provisional slips deliberately omit it. A "fiscalise later" QR on the provisional slip (pointing to a lookup page by provisional number) is optional.
12. **Z-report reconciliation** must compare device totals with the sum of `FISCALISED` sales only, with unfiscalised listed as a reconciling item.

### 10.5 Ambiguous-timeout flow (the dangerous one)

`SUBMITTING` for > 30 s (or a network error mid-request) → mark `UNKNOWN` → reconciler calls **`GetInvoice/{invoiceNo}`**: found → copy QR/verification/global no and mark `FISCALISED` (no resubmit needed); "not found" → safe to resubmit the **same** number, or fall to `UNFISCALISED` if the device is still unreachable; GetInvoice itself unreachable → stay `UNKNOWN` and retry. Never issue a new number for an `UNKNOWN` sale. The `FISCALISED_NO_QR` state is no longer needed.

### 10.6 Decisions (2026-10-03)
- Provisional (non-fiscal) slips are accepted by the client when fiscalisation is unavailable.
- Auto-retry: **same fiscal day only**. Older unfiscalised sales: manual Fiscalise with admin approval.
- Offline limit: **configurable hours, default 5, and "no limit" allowed** (service must never be disrupted by a lockout). When no limit is set, the till shows a warning banner only.
- Customer copy: physical slip is primary. Fiscal invoice (and provisional) can be **emailed** from the sale (existing `lib/email.ts` + email settings).
- Receipt profile is **per branch** and configurable: company/branch name, address, phone, email, TIN, VAT no., logo, footer text, VAT %.

## 11. Build phases

0. **Discovery spikes (1–2 days)**: GetConfig on test device; test sequential vs parallel SubmitReceipt; confirm receipt-counter behaviour and ZWG/USD handling; confirm VAT rate.
1. **Foundations**: schema changes, cashier role, branch scope guard, counters, lock + idempotency, `fiscalizePosSale` service with unit tests.
2. **API**: products search, sale create/fiscalize, today summary, reprint, admin summary.
3. **POS UI**: keyboard flow, currency toggle, totals strip, status header.
4. **Receipt + print**: slip component, QR, kiosk-printing setup doc.
5. **Day automation hardening**: port schedule rules, global idle logic, catch-up close, Z-report capture.
6. **Admin**: branch prefix/header/footer settings, POS toggle, all-branch invoice view and reports.
7. **Testing**: see §12.
8. **Pilot** on one branch against test device, then multi-branch.

## 12. Test plan

- Unit: numbering (gaps, per currency, per branch), VAT maths (inclusive/exclusive, rounding), role scoping.
- Integration against ZIMRA **test** device: single sale; rejected sale does not consume number; timeout then reconcile; day closed refusal; open/close/catch-up.
- **Concurrency simulation** (script, test server only): N branches × M cashiers submitting in parallel in both currencies; assert no duplicate invoice numbers, no gaps, contiguous ReceiptGlobalNo, per-branch totals equal sum of invoices, Z-report totals equal sum across branches.
- Playwright E2E: full keyboard flow (Enter/F12), currency toggle, branch isolation (branch A cannot see B), admin sees all, print preview snapshot of slip.
- Security tests: tampered branchId, replayed idempotency key, cashier hitting admin APIs.

## 13. Decisions log

Decided: VAT configurable, default 15.5%; ZWG = USD × rate with per-product override; pilot branch Harare Street (prefix H: HU/HZ); POS gets its own analytics; parallel calls verified (§3.1); unfiscalised queue with manual Fiscalise (§10).

## 14. Open items (non-blocking)

1. Harare Street receipt details (name, address, phone, email, TIN/VAT, logo, footer) are entered in the branch admin screen once built; no code blocker.
2. Remaining branch names and prefixes (e.g. C for Cranborne) when they come online.
3. Customer-copy channel beyond email (WhatsApp) is deferred.
4. Written confirmation from ZIMRA/Axis on provisional slips and the 24 h device limit is still advisable for the client file.

## 15. Phase 1 (DONE 2026-10-03): backend foundation

Built and verified against the ZIMRA test device with `npm run pos:simulate` (32 checks, all pass):
- VAT default 15.5 (`.env.example`, `invoice.service.ts`); branch-level `pos.taxPercent`.
- `cashier` role end to end (types, user model, validation, role dropdown, seed). Every existing `role === "branch_user"` data scope now means "not admin", so a cashier can never see all-branch analytics. `proxy.ts` confines cashiers to `/pos` and `/api/pos`.
- `Branch.pos` (enabled, invoicePrefix unique, tax, currency, offlineLimitHours default 5 / null = no limit, receipt profile for name/address/phone/email/TIN/VAT/logo/footer).
- `InvoiceCounter` (atomic per branch+series, released numbers reused so the fiscal series stays gapless) and `PosSale` (state machine: PENDING, SUBMITTING, FISCALISED, UNFISCALISED, UNKNOWN, FAILED, VOIDED).
- `zimraPosDevice.service.ts`: SubmitReceipt with outcome classification (ok / rejected / not_sent / unknown), `GetInvoice` recovery, status check.
- `posSale.service.ts`: idempotent create, atomic claim, circuit breaker, in-flight limiter (3), provisional numbers (`HUP0001`), same-day auto-retry with backoff, older-day sales need admin approval, UNKNOWN reconciliation via GetInvoice then same-number resubmit, void, per-currency summaries.
- `lib/auth/pos-scope.ts`: single branch-scope guard (role and branch read from DB, not the token or request body).
- API: `POST/GET /api/pos/sales`, `GET /api/pos/sales/[id]`, `POST .../fiscalise`, `POST .../void` (admin), `GET /api/pos/summary`, `GET /api/cron/pos-queue` (Bearer CRON_SECRET, schedule every minute).

Not yet built: POS screen, receipt/print, email of invoice, offline browser queue, branch settings admin screen, POS analytics pages, product pricing (ProductMaster has no price yet), auto open/close hardening, credit notes, Playwright tests.
Known limits: tax-exclusive mode untested against the device (inclusive only); the in-process breaker/limiter are per server instance (device serialises regardless); day-closed rejection text is pattern-matched (unknown rejections default to UNFISCALISED so a sale is never lost).

## 16. Phase 2 (DONE 2026-10-03): till UI, slip, branch and product admin

Built and exercised in a real browser against the ZIMRA test device:
- `/pos` full-screen till (`app/(pos)`): product search with ranking and barcode-style exact code match, Enter/qty/price flow with price-at-till items and typed items, F12 fiscalise, F2 currency (instant reprice, ZWG = USD x rate with fixed-ZWG override), F3/F4/F8/F9/Esc Esc, live device/day status, offline indicator, per-branch daily totals per currency (fiscalised and pending), sign out.
- 80mm slip (`lib/pos/slip.ts`) mirroring the `new-shop-online` layout; browser print through a hidden iframe (kiosk-printing); provisional variant; DUPLICATE marking on reprints; same renderer used for email.
- Sales drawer (F8): reprint, email, Fiscalise for unfiscalised sales (older-day sales need an admin).
- Provisional flow verified in the UI: device down gave `HUP0001`; manual Fiscalise then produced `HU0001` linked "was HUP0001".
- Admin: `/pos-settings` (enable, prefix, VAT, tax code, default currency, offline limit hours or no limit, full receipt profile per branch), `/pos-products` (add, inline price edit, fixed ZWG, price-at-till, active, bulk paste import). Sidebar group "Point of sale".
- API: products (list/manage/bulk upsert/patch/soft delete), branches (list/patch), sale email. Cashier login allowed by role (no staff-email allowlist needed); cashier confined to `/pos` and `/api/pos`; verified 403 on admin APIs, catalog edits, branch changes, other branches and void.
- Local demo data: `npm run pos:demo`. Till setup guide: `docs/POS_TILL_SETUP.md`.

Bugs found and fixed during browser testing: focus lag after picking an item (fast typing landed in the wrong field); quantity appending ("13") instead of replacing; focus lost after printing; shared-products list showing every branch's products; cashier had no sign-out.

Not built yet: offline browser queue (service worker and IndexedDB, offline limit enforcement), POS analytics pages, admin all-branch invoice view, product image/stock link to uploaded stock, credit notes, Playwright E2E, day open/close hardening for the shared device, email not tested against a live SMTP server.

## 17. Phase 3 (DONE 2026-10-03): offline mode, analytics, day-close guard, E2E

**Offline mode** (browser, no extra dependencies)
- `lib/pos/offlineStore.ts` (IndexedDB): sale queue, cached product list, leased provisional numbers, offline clock.
- `components/pos/useOfflineQueue.ts`: reachability from real requests (not `navigator.onLine`), queue drain every 20 s and on reconnect (oldest first, idempotency key per sale, 4xx kept visible with the reason, 401/403 keeps everything and asks for a new sign-in), number leasing.
- `POST /api/pos/numbers/lease`: hands a till 100 provisional numbers per currency (HUP0101...). If a till runs out offline it uses a till-unique fallback series (HUQ7K30001) so service never stops.
- Offline sale: numbered provisional slip printed at once, sale saved on the device with the till time. On sync the server keeps the number the customer already holds, fiscalises (same-day) with the next fiscal number and links the two (device notes). Sales from an earlier day wait for admin approval (now visible as Not fiscalised, no longer stuck as Sending).
- Offline limit per branch (hours, or none): at the limit the till refuses with a clear message; with no limit it never blocks. Banner shows how long the till has been offline.
- Sign out is refused while sales are still saved on the till (nothing is lost on a shared PC); other cached data is wiped at sign out.
- `public/pos-sw.js` (registered in production): caches `/_next/static` and the last good `/pos` page so a reload during an outage still opens the till. Verified in a production build with the server killed.

**Analytics and all-branch view**: `/pos-sales` (admin: all branches or one; branch user: own branch): date range and presets, totals per currency, by branch, by day, needs-attention strip, sales table with Fiscalise (admin approves older days) and CSV export. API: `GET /api/pos/analytics`, `GET /api/pos/sales?from&to`.

**Day-close guard**: closing the shared fiscal day first gives the retry queue one more pass and refuses if today's POS sales are still unfiscalised (409 `POS_PENDING`, "Close anyway" on the Fiscal Day page). The scheduled close defers and retries every minute for up to 120 minutes, then closes regardless (the stragglers then need admin approval). It also notices a day an admin already closed by hand.

**Tests**: `npm run pos:simulate` now has 48 checks (adds offline sync, forged/duplicate provisional numbers, 30-day limit, day-close guard, analytics consistency). Playwright project `pos` (`tests/e2e/pos.spec.ts`): keyboard flow, F12 fiscalise and print, cashier confinement, offline sale then sync.

**Known limits / next**: tax-exclusive pricing still untested on the device; email untested against live SMTP; service worker only active in production builds; offline mode needs the till to have been opened online once on that PC; credit notes and stock integration not built; per-instance in-memory breaker/limiter if hosted on several servers (the device serialises regardless).

## 18. Remaining items (DONE 2026-10-03)

- **Credit notes**: a supervisor (branch user or administrator, never a cashier) reverses a fiscalised sale in full from the sales drawer (F8) or `/pos-sales`. Own series (`HUC0001`, `HZC0001`), device format verified (SubmitReceiptExt with the original receipt's global number and fiscal day, negative quantity and totals), one credit note per sale (atomic claim), provisional when the device is down and fiscalised by the retry queue, void frees the sale again. Slip prints as a credit note naming the original invoice and reason. Analytics keep sales, credit notes and net apart.
- **Tax-exclusive pricing** verified on the device (line totals exclude VAT, invoice amount includes it), for sales and credit notes.
- **Import from stock uploads**: `POST /api/pos/products/import-stock` / button on `/pos-products` fills a branch's product list from its latest stock upload (in-stock, priced lines; existing prices kept unless asked).
- **Printer check**: "Print test slip" in POS settings (sample slip with the branch's details, marked as a test).
- **Email verified** end to end against a local SMTP server (Playwright test).
- **Deployment**: `vercel.json` per-minute crons, `maxDuration` on fiscalising routes, `npm run pos:cron` for self-hosting, `.env.example` updated, `docs/POS_GO_LIVE.md` checklist.
- **Tests**: simulation 65 checks (adds credit notes, exclusive pricing, stock import); Playwright project `pos` 8 tests (adds supervisor credit note, cashier restriction, email via SMTP sink, test slip).

Known limits: credit notes are full-sale only (no partial returns); upload prices are assumed USD; the physical 80mm printer itself could not be exercised from here (use the test slip); the service worker is production-only.
