# Agent and engineer handoff

Read this first. It tells you what the system is, how to run it, how to test it, what was decided, what is unfinished, and the traps that have already cost time. Written 2026-11-06 at the end of a long simplification and hardening effort. Where this file and the code disagree, the code wins; tell the owner.

## 1. What the system is

One Next.js application serves six jobs, plus one separate service:

| Module | Job | Where |
|---|---|---|
| **pos** | Multi-branch point of sale: tills, cashiers, sales, credit notes, slips, offline selling | `app/(pos)`, `app/(admin)/pos-*`, `app/api/pos`, `lib/pos`, `lib/services/pos*.ts`, `components/pos` |
| **fiscal** | ZIMRA fiscalisation: devices, certificates, fiscal day, Z-reports, the retry queue | `lib/fiscal`, `lib/services/fiscal*.ts`, `lib/zimra*.ts`, `app/(admin)/fiscal-*`, `app/api/admin/fiscal-*` |
| **stock** | Stock file uploads and the product list | `app/(admin)/uploads`, `products`, `lib/upload`, `app/api/upload` |
| **analytics** | Dashboards and reports on stock and POS | `lib/analytics`, `app/(admin)/dashboard`, `branch-analytics`, `product-movement`, `ai-agent` |
| **shop** | Online storefront, quotations, online payments, shop invoices | `app/(shop)`, `app/api/shop`, `app/api/payments`, `lib/shop`, `lib/services/invoice.service.ts` |
| **admin** | Users, branches, settings, role and menu access | `app/(admin)/users`, `branches`, `access`, `settings`, `lib/auth`, `lib/actions` |
| **fiscal-service** | A separate Node/TypeScript service that signs receipts and talks to ZIMRA directly (the app calls it over HTTP when `FISCAL_BACKEND=service`) | `fiscal-service/` (own `package.json`, own tests) |

Stack: Next.js 16 (App Router, `proxy.ts` instead of `middleware.ts`), React 19, TypeScript, MongoDB with Mongoose 8, next-auth v5 (beta) with Clerk wrapped around the proxy, Tailwind 4 with shadcn/ui, zod, Playwright, BullMQ/Redis (optional jobs). The fiscal service uses the MongoDB driver directly.

`docs/MODULES.md` has the module map and the couplings still to untangle.

## 2. Repository map

```
app/(admin)      staff screens        app/(pos)   the till          app/(shop)   storefront       app/(auth)  sign-in
app/api          all API routes (admin/, pos/, shop/, payments/, cron/, ...)
components/      UI (ui/ is shadcn; pos/, fiscal/, branches/, users/, shop/ ...)
lib/auth         roles, permissions, route guards, delegated user rules
lib/fiscal       issue.ts (THE door to fiscalisation), invoiceMapping, serviceMapping, service client
lib/services     business logic (posSale, posTill, fiscalSchedule, shopFiscal, permissions, ...)
database/        Mongoose models
constants/       the sidebar (constants.ts), routes
scripts/         tests, simulations, seeds, verify-ui.cjs, acceptance-run.ts
fiscal-service/  the separate service (src/core signing, src/engine day+queue, src/devices registry, scenarios/, scripts/)
docs/            all documentation (see section 9)
tests/           Playwright specs (tests/e2e) and helpers
```

Git-ignored but present on the owner's machine: `certificates_*`, `test certificates/` (private keys of ZIMRA test devices), `zimra-fdms-main/` (vendored upstream copy), `ref-codebases/` (reference apps), `test-evidence/`, `test-output/`, `.env*`.

## 3. Run it

```bash
npm install
# .env.local (secrets, database) and .env.test (test accounts) are NOT in git: ask the owner. .env.example lists every variable.
npm run dev                      # http://localhost:3000. If another program owns 3000: npx next dev -p 3100
```

- **MongoDB** must be running (`OFFLINE_MONGODB_URI`, default `mongodb://localhost:27017/`; non-production uses the offline URI). On Windows if the service will not start: `mongod --dbpath <empty folder> --setParameter diagnosticDataCollectionEnabled=false`, then re-seed.
- **Seed** a fresh database: `npm run seed:test`, `npx tsx scripts/pos-seed-test-accounts.ts`, `npm run pos:demo`. Test accounts are in `docs/STOCKFLOW_TEST_PLAN_v2.0.docx` Appendix A.
- **Scheduler**: nothing retries or opens/closes days unless `/api/cron/pos-queue` and `/api/cron/fiscal-schedule` are called every minute with `Authorization: Bearer $CRON_SECRET` (`vercel.json` does this on Vercel; locally run `npm run pos:cron`).
- **Machine limits**: keep at least 5 GB free disk (MongoDB refuses writes under 500 MB) and plenty of free memory. Background commands get killed when memory is critically low; that has stranded real devices mid-run.

Main environment variables (names only; never print values): `MONGODB_URI`, `OFFLINE_MONGODB_URI`, `MONGO_DB_NAME`, `AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAILS` (super admins), `STAFF_ALLOWED_EMAILS` (self-registration and OAuth only), `CRON_SECRET`, `FISCAL_BACKEND` (`legacy` or `service`), `FISCAL_SERVICE_URL`, `FISCAL_SERVICE_TOKEN`, `FISCAL_SERVICE_CENTRAL_DEVICE_ID`, `FISCAL_ENCRYPTION_KEY`, `ZIMRA_API_URL`, `INVOICE_DEFAULT_HS_CODE`, `NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED`, `SMTP_*`.

## 4. Test it

Everything below was green on 2026-11-06 unless noted. Run these before and after any change to fiscal, auth or POS code.

| Command | Expect |
|---|---|
| `npx tsc --noEmit` | no output (the project type-checks clean) |
| `npm run check:guards` | `All non-public API routes have an auth check.` |
| `npm run test:permissions` | 12 checks pass |
| `npm run test:close-schedule`, `npm run test:clock-skew` | 10 checks pass each |
| `npm run test:shop-fiscal` | all checks pass (needs MongoDB) |
| `cd fiscal-service && npm test` | 140 pass (needs MongoDB and openssl) |
| `npm run test:service-backend` | `All checks passed` (the app through the real service against a fake ZIMRA) |
| `npm run test:day-status`, `test:close-guard`, `test:tills`, `test:fiscal-alerts`, `test:vat` | exit 0, no FAIL lines |
| `npm run verify:ui` (app running; `BASE_URL=...` if not port 3000) | 29 checks pass for admin, branch manager and cashier; screenshots in `test-output/ui-verify` |
| `cd fiscal-service && npx tsx scripts/recover-live.ts "<certs>" <id> --yes` | `RESULT: PASS` on a closed, clean ZIMRA TEST device (live) |
| Go-live rehearsal | see `docs/REHEARSAL_RUNBOOK.md`; **never completed end to end yet** |
| `npm run pos:simulate`, Playwright `pos*.spec.ts` | need the Axis virtual device, whose licence was "pending" on 2026-11-06: blocked, not broken |

Do not use `npx playwright test` casually: `tests/global-setup.ts` deletes the test branch's uploads. `npm run verify:ui` does not use the Playwright config and is safe.

Tester-facing plan with 389 cases: `docs/STOCKFLOW_TEST_PLAN_v2.0.docx` (regenerate with `python docs/test-plan-v2/build.py` after editing `docs/test-plan-v2/content_*.py`).

## 5. How the important parts work

### 5.1 Fiscalisation: one door, two back ends

- **The door**: `lib/fiscal/issue.ts`. `issueFiscalDocument({kind:"pos",saleId}|{kind:"shop",invoiceId})` returns `FISCALISED`, `QUEUED` or `REVIEW` and never throws because ZIMRA or a device is unwell. `runFiscalQueues()` runs the till queue and the shop queue; `/api/cron/pos-queue` calls it every minute.
- **Back ends** (`FISCAL_BACKEND`): `legacy` talks to a Virtual Device over HTTP (the Axis device); `service` talks to `fiscal-service/`, which signs receipts itself and talks to ZIMRA directly. Prefer `service`; the legacy path is kept for the Axis device. With `service`, the Add device wizard sends each ZIMRA certificate zip to the service (`lib/services/fiscalServiceDevices.service.ts`: `pushCertificateToService`, `verifyDeviceViaService`), and the central device is chosen on Fiscal devices with **Make central** (`setCentralDevice`, stored in `FiscalSettings.centralFiscalDeviceId`; refused while the old central has an open day or waiting sales). `FISCAL_SERVICE_CENTRAL_DEVICE_ID` is only a fallback. The legacy sync route calls `/api/VirtualDevice/GetConfig`, which the public ZIMRA host does not serve (HTTP 404).
- **Till sales** (`lib/services/posSale.service.ts`): a sale is stored first, then fiscalised. If it cannot be, it stays `UNFISCALISED` with a provisional number and the queue retries it. A sale from an earlier day is fiscalised in whatever day is open when the system recovers: no approval step (owner's decision). Its `soldDate` keeps the real day.
- **Shop invoices** (`lib/services/shopFiscal.service.ts`): same promise. On trouble the invoice records `fiscalAttempts`, `fiscalLastError`, `fiscalNextRetryAt` and is retried (1, 2, 5, 10, then every 30 minutes). Wrong data or 50 failures goes to `fiscalNeedsReview` with an alert. Credit and debit notes are refused (the shop cannot record which invoice they correct): those exist only at the till.
- **ZIMRA facts that bite**: a device remembers every invoice number it was given and refuses a repeat as RCPT013 (a RED receipt); a RED receipt cannot be undone and stops the day being closed by the system (a person must close it on the ZIMRA portal); VAT must be computed once per tax group, not per line (RCPT026/027); a named buyer needs an email or a phone number; a device's day may not exceed its maximum length (`taxPayerDayMaxHrs`, usually 24 h).

### 5.2 The fiscal day

- Open/close times, weekdays and timezone belong to the **device** (central or branch), not to the branch.
- **Legacy**: `lib/services/fiscalSchedule.service.ts`. The close stays owed across midnight and retries (every minute for 5 h, then every 10 min) until it succeeds (`closeDue`). The queue opens the day when sales are waiting and the device allows it (`openDayForWaitingSales`).
- **Service**: `fiscal-service/src/engine/scheduler.ts`. Same owed-close rule (`closeOwed`), plus stale-day recovery: a day open longer than the device's limit minus one hour is closed and a new one opened at once. The service refuses to use a day it did not open (its receipt counters are unknown).
- **Clock**: `lib/clockSkew.ts` learns ZIMRA's clock from the `Date` header of every call (`lib/zimraHttp.ts`); the app's scheduler uses ZIMRA's time, and a difference of 30 s or more raises an alert. The service has its own server-corrected clock for signing.
- Full explanation and what was verified live: `docs/FISCAL_OUTAGE_RECOVERY.md`.

### 5.3 Access control

- Roles stored on the user: `admin`, `branch_user` (shown as Branch manager), `cashier`. A **super admin** is an admin whose email is in `BOOTSTRAP_ADMIN_EMAILS` (any admin if the list is empty).
- `lib/auth/permissions.ts` (pure, edge-safe) lists every grantable page and action, the presets, and which API group needs which permission. A role's saved permissions live in the `RolePermission` collection (`lib/services/permissions.service.ts`, 15 s cache) and travel in the JWT as `perms`.
- Enforcement: `proxy.ts` refuses pages a role was not granted (reads the token, so a change reaches page checks when the browser refreshes its session); API routes call `requirePermission(session, key)` (reads the session, so changes are immediate); the sidebar builds from the user's allowed list; `app/(admin)/layout.tsx` lets a cashier through only if granted other pages.
- Admin is fixed. Menu access, Exchange rates, Quotations, Invoices and the shop homepage settings are admin only and cannot be granted.
- Granting Users is safe: `lib/auth/delegated-users.ts` confines a non-admin to their own branch, forbids creating or touching admins, forbids changing their own role. Granting POS settings is limited to the person's own branch (`resolvePosScope`).
- `scripts/check-api-guards.mjs` fails when a non-public API route has no auth check. Add new routes with a guard.

### 5.4 Tills and branches

A till is a checkout point; all tills in a branch share its receipt numbers and device. One status per till (Ready / Off / Waiting for POS to be switched on). Sales on a till that was switched off after an offline sale was made still sync (do not "fix" that). Add branch is a four-step wizard (`components/branches/AddBranchWizard.tsx`); devices are added by a three-step flow with live progress and retry (`components/fiscal/DeviceWizards.tsx`); the central device and branch devices share one editor (`components/fiscal/FiscalDevicesManager.tsx`, `DeviceEditor`).

### 5.5 Shop

Checkout and payments are off unless `NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED=true`. A paid quotation becomes an invoice handed to `issueFiscalDocument`. With `FISCAL_BACKEND=service` the shop uses the central device (`FISCAL_SERVICE_CENTRAL_DEVICE_ID`).

## 6. Decisions the owner has made (do not re-litigate)

1. Setup flows first (wizards), then roles, cashier mode and clarity.
2. Automatic fiscal day open/close is ON by default for new devices; the day also opens when a sale is waiting.
3. Cashiers see the fiscal day and device state in the till's top bar (owner decision 2026-11-07) but never error codes or device management. A sale is never rejected because of ZIMRA.
4. Sales from an earlier day are pushed to the day that is open when the system recovers (no approval).
5. Open/close times stay with the device.
6. Full role-based access: any page or action can be granted to Branch manager or Cashier; Admin is fixed; no per-person overrides.
7. Menu pages that a role was not given are refused by URL, not just hidden.
8. In a multi-day outage: close the stale day, open a new one, then retry the invoices; keep the clock right.
9. The e-commerce shop is kept working but checkout stays off by default.

## 7. State and open items (2026-11-06)

**Done and committed** (the whole history is on `master`, which equals `commerce-platform`): everything in section 5, the test suites in section 4, the v2.0 test plan and this documentation.

**Push status.** The assistant was asked to push `master` and `commerce-platform` but the permission system blocked it. Run `git status -sb` and `git log origin/master..master --oneline`; if master is ahead, the owner pushes with `git push origin master commerce-platform` (or grants the permission).

**Open:**
- **The go-live rehearsal has never completed end to end.** Run it with `docs/REHEARSAL_RUNBOOK.md`. Before that, probe devices read-only; use only closed, clean ones.
- **Axis virtual device licence** is "pending": renew in its Fiscal Cloud account. Until then `npm run pos:simulate` and `tests/e2e/pos*.spec.ts` cannot pass (they expect real fiscalisation on that device).
- **Test-device days** the owner closed on the portal after an interrupted run: 31728, 32160, 31591. Re-probe before use.
- **Shop credit/debit notes** are refused, by design, until the shop can record the original invoice.
- `lib/services/posSale.service.ts` (till) and `lib/services/invoice.service.ts` (shop) are still two engines behind the one door; unifying them is the next module step (`docs/MODULES.md`).
- The shop home page is the shop, not the sign-in page.
- The `.claude/settings.local.json` file is tracked but local to the owner; do not commit changes to it.

## 8. Working rules (learned the hard way)

1. **Never `git stash`, `git reset --hard`, `git checkout -- .` or force-push.** The owner often has uncommitted work. Stage by explicit path, or by hunk (`git diff -U0 file` filtered, then `git apply --cached --unidiff-zero`) when a file mixes your change with theirs. Commit messages end with the co-author line the harness gives you.
2. **Do not push** unless the owner asks, and expect the push to need their permission.
3. **Test environment only.** Never point anything at production or at a live ZIMRA device. Probe devices read-only first.
4. **Never print secrets** (`.env*`, certificates, keys, activation keys, passwords) and never commit them.
5. **Check disk and memory before long runs.** Do not restart a run the system killed for low memory without asking: it may have left device days open.
6. **Port 3000 may belong to another project** on the owner's machine. Start this app on another port if needed and stop only the process you started.
7. **Windows quirks**: use `python`, not `python3`; CRLF warnings on commit are normal; some tools are missing (no pandoc, LibreOffice or Poppler on the owner's machine).
8. **UI work**: the owner's global instructions require the design skills (impeccable, emil-design-eng, ui-ux-pro-max) before visual changes; keep to the existing shadcn styling, plain language, and verify in a real browser (`npm run verify:ui`).
9. **Verify claims before building on them.** An early audit said the shop and till had two credit-note implementations; they do not. Read the code.
10. Add tests with the change. Fiscal changes need a fake-gateway test in `fiscal-service/test` or `scripts/test-service-backend.ts`, and ideally a live check on a closed test device.

## 9. Documentation index

| File | What it is |
|---|---|
| `docs/AGENT_HANDOFF.md` | This file |
| `docs/REHEARSAL_RUNBOOK.md` | Paste into a Claude chat to run the go-live rehearsal on real ZIMRA test devices |
| `docs/STOCKFLOW_TEST_PLAN_v2.0.docx` | Tester plan, 389 cases (supersedes `docs/POS_TEST_CHECKLIST.docx`); source in `docs/test-plan-v2/` |
| `docs/SIMPLIFICATION_TEST_SHEET.md` | The earlier markdown test sheet for the simplification work |
| `docs/FISCAL_OUTAGE_RECOVERY.md` | Outages, stale days, the clock, the shop queue, what was verified live |
| `docs/FISCAL_RUNBOOK.md` | Operating the fiscal service: ZIMRA error codes, closing days, certificates |
| `docs/FISCAL_SERVICE_PLAN.md`, `docs/MULTI_DEVICE_AND_CERT_PLAN.md`, `docs/POS_MODULE_PLAN.md`, `docs/POS_GO_LIVE.md`, `docs/POS_TILL_SETUP.md` | Design and go-live plans |
| `docs/MODULES.md` | Module map and remaining couplings |
| `docs/LIVE_DB_RESET.md`, `docs/FISCAL_UPLOAD_BACKLOG.md`, `docs/FISCAL_E2E_EVIDENCE_PLAN.md`, `docs/DESPATCH_SCAN.md`, `docs/PRODUCT_IMAGE_SOURCING.md` | Operations and feature notes |
| `README.md`, `CODEBASE_DOCS.md`, `INVOICING_DOCS.md`, `BILLING_DOCS.md`, `IMPLEMENTATION_PLAN.md`, `PLAYWRIGHT_TESTING_PLAN.md` | Older root documents (the first two are the most useful) |

## 10. First hour for a new agent

1. Read this file and `docs/FISCAL_OUTAGE_RECOVERY.md`.
2. `git status -sb`, `git log --oneline -15`. Do not touch uncommitted files you did not create.
3. Run the section 4 commands that need no devices (`tsc`, `check:guards`, `test:permissions`, `test:close-schedule`, `test:clock-skew`, `test:shop-fiscal`, `cd fiscal-service && npm test`, `test:service-backend`).
4. Start the app and run `npm run verify:ui`.
5. Ask the owner what they want next; the open items in section 7 are the candidates.
