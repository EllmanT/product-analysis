# Production deployment checklist (client testing release)

Written 2026-11-08. Goal: StockFlow (Vercel) and the fiscal service (always-on host) both live, so the client can run their own tests against the **ZIMRA test environment**. Nothing here points at live ZIMRA. Names only, never values: keep real values in the host dashboards and a password manager.

**Chosen hosting for testing: Vercel Hobby (app) + Render free (fiscal service) + Atlas M0, all free tiers.** Follow `docs/DEPLOY_RENDER_VERCEL.md` for the step-by-step; this file is the full list of what must be true. Blank variable files to copy into the hosts: `docs/env/app.production.env.template` (Vercel) and `docs/env/fiscal-service.production.env.template` (Render). Free-tier changes to the sections below: `vercel.json` now holds only the daily `cert-expiry` cron (Hobby rejects per-minute crons), so the `pos-queue` and `fiscal-schedule` jobs run from cron-job.org every minute; Render free sleeps after 15 minutes idle, so an uptime monitor pings `/health` every 5 minutes.

## 0. Architecture in one picture

```
Browser ──► Vercel (Next.js app, 3 cron jobs) ──HTTPS + bearer token──► Fiscal service (ONE always-on container)
                    │                                                         │
                    └──► MongoDB Atlas: app database                          ├──► MongoDB Atlas: fiscal_service database
                                                                              └──► ZIMRA gateway (test: fdmsapitest.zimra.co.zw)
```

**The fiscal service must NOT be a Vercel project.** It is a long-running process: it keeps an in-process scheduler (opens and closes fiscal days), per-device send queues and a database lease that lets exactly one copy write. Serverless functions start and stop per request, so the queue would stall and days would not open or close on time. `docs/FISCAL_RUNBOOK.md` section 8 says the same: "Run exactly one instance. Do not run it on a serverless host."

## 1. Before you deploy anything

- [ ] **Commit your work.** Vercel builds from git and `git status` shows many uncommitted files (fiscal day overview, Z-report breakdown, brand mark, etc.). Review, run the checks in section 7, commit, then push (you asked for no pushes unless requested, so this is yours to do).
- [ ] `npx tsc --noEmit` prints nothing. **Important:** `next.config.ts` has `ignoreBuildErrors: true`, so Vercel will deploy even with type errors. Only this local check protects you.
- [ ] `npm run check:guards`, `npm run test:permissions`, `(cd fiscal-service && npm test)`, `npm run test:service-backend` all pass.
- [ ] Decide the two public addresses now, because several variables need them: app `https://app.<domain>` and fiscal service `https://fiscal.<domain>` (the host's own `*.up.railway.app`-style address is fine for testing).
- [ ] Generate fresh secrets for production (do not reuse your `.env.local` values):
  - `openssl rand -base64 32` for `AUTH_SECRET`, `FISCAL_ENCRYPTION_KEY` (app), `FISCAL_ENCRYPTION_KEY` (service)
  - `openssl rand -hex 32` for `CRON_SECRET` and `FISCAL_SERVICE_TOKEN` (service rejects tokens under 16 characters)
  - Put both encryption keys in a password manager **now**. Lose one and every stored device certificate encrypted with it is unreadable.

## 2. MongoDB Atlas (two databases)

- [ ] App database: `MONGODB_URI` + `MONGO_DB_NAME`. Create a dedicated database user (not your personal one).
- [ ] Fiscal service database: separate database name (`fiscal_service`), ideally its own database user. The runbook says it is "not the POS app's database".
- [ ] Network access: Vercel has no fixed IPs, so Atlas must allow `0.0.0.0/0` (protected by the strong user password) or use the Vercel/Atlas integration. The fiscal host: allow its IP if it has a static one, otherwise `0.0.0.0/0`.
- [ ] **Backups on for the fiscal database** (receipts, day state, device registry). The free tier has no real backups: use M10 or schedule `mongodump`. Do one restore test before go-live (runbook section 8).
- [ ] The production database starts empty. Nothing from your local dev database moves across; certificates must be re-added through the Add device wizard.

## 3. Environment variables: the Next.js app (Vercel project)

`NODE_ENV=production` is set by Vercel automatically. That matters: `lib/mongoose.ts` uses `MONGODB_URI` only in production and `OFFLINE_MONGODB_URI` everywhere else.

`NEXT_PUBLIC_*` values are baked in at **build** time: change one and you must redeploy.

### Required (the app will not work without these)

| Variable | What to set |
|---|---|
| `MONGODB_URI` | Atlas connection string for the app database |
| `MONGO_DB_NAME` | App database name (set it explicitly; empty falls back to the URI default) |
| `AUTH_SECRET` | 32-byte random secret (next-auth sessions, proxy token check, till pairing, shop JWT) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | **Production** Clerk instance keys (`pk_live_`/`sk_live_`), not the dev instance. `proxy.ts` wraps everything in Clerk. Add your domain in the Clerk dashboard |
| `CRON_SECRET` | Random secret. Vercel sends it as `Authorization: Bearer …` to the three cron routes; without it they answer 503 and nothing retries or opens/closes days |
| `BOOTSTRAP_ADMIN_EMAILS` | Comma list of super-admin emails. **If left empty, every admin counts as a super admin** |
| `BOOTSTRAP_ADMIN_PASSWORD` | First-login password for those emails. Their admin account is created on first sign-in with it; it never overwrites an existing password. Change it in the app, then delete this variable |
| `STAFF_ALLOWED_EMAILS` | Comma list allowed to self-register and sign in with OAuth |
| `FISCAL_ENCRYPTION_KEY` | Base64 of 32 random bytes (app-side secret box). Different from the service's key |
| `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` | All the app's public URL, `https://app.<domain>` (used in emails, PDFs, links, API calls) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | A real mail account/provider. Alert emails, password and notification mail depend on it. Do not also set the `EMAIL_*` names: `lib/utils/sendEmail.ts` reads `EMAIL_*` first and falls back to `SMTP_*` |
| `ADMIN_EMAIL` | Where admin notifications go |
| `FISCAL_ALERT_EMAILS` | Extra addresses for fiscal alerts (admins already get them) |

### Fiscal wiring (required for the client to test fiscalisation)

| Variable | What to set |
|---|---|
| `FISCAL_BACKEND` | `service` (the default `legacy` needs an Axis device whose licence is pending) |
| `FISCAL_SERVICE_URL` | `https://fiscal.<domain>` (no trailing slash) |
| `FISCAL_SERVICE_TOKEN` | Exactly the same value as on the service |
| `FISCAL_SERVICE_CENTRAL_DEVICE_ID` | Optional fallback only. The real central device is chosen on Fiscal devices > Make central |
| `ZIMRA_API_URL` | Leave unset or set to the ZIMRA **test** base. The fiscal settings page also has a "use production URL" toggle: keep it **off** for client testing |
| `POS_TIMEZONE` | `Africa/Harare` (set it explicitly) |

### Company and invoice defaults

| Variable | Note |
|---|---|
| `INVOICE_COMPANY_LEGAL_NAME`, `_TRADE_NAME`, `_TIN`, `_VAT_NUMBER`, `_ADDRESS`, `_PHONE`, `_EMAIL`, `_REGION`, `_CITY` | Commit 88f328f moved the company profile into the database, so these are a fallback. Set them to the client's values anyway, then confirm the profile page shows the same |
| `INVOICE_DEFAULT_TAX_CODE`, `INVOICE_DEFAULT_TAX_PERCENT`, `INVOICE_DEFAULT_CURRENCY`, `INVOICE_DEFAULT_RECEIPT_PRINT_FORM` | Defaults for shop invoices |
| `INVOICE_DEFAULT_HS_CODE` | 8 digits. ZIMRA turns a receipt Red when a VAT line has no valid HS code |

### Sign-in with Google / GitHub (only if you offer those buttons)

| Variable | Note |
|---|---|
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | Create **production** OAuth apps. Callback URLs: `https://app.<domain>/api/auth/callback/google` and `/github`. If you do not want OAuth, hide the buttons or the sign-in will error |
| `AUTH_URL`, `AUTH_TRUST_HOST=true` | Not needed on Vercel (it is detected). Needed on any other host |

### Optional features (leave unset to keep the feature off)

| Variable | Feature |
|---|---|
| `NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED` | Leave **unset**: shop checkout stays off (owner decision) |
| `ECOCASH_*`, `ZIMSWITCH_*` | Online payments. Only if checkout is enabled |
| `ANTHROPIC_API_KEY`, `DESPATCH_SCAN_MODEL` | Despatch-slip scanning in the till |
| `OPENAI_API_KEY`, `OPENAI_DOCUMENT_MODEL` | Shop "match a document" feature |
| `BULLMQ_REDIS_URL` or `REDIS_URL` | Background upload queue (TCP `rediss://` URL). Skip unless you use it |
| `LOG_LEVEL` | `info` is fine |
| `FISCAL_ENCRYPTION_KEY_ID`, `FISCAL_ENCRYPTION_KEY_PREV` | Only when you rotate the encryption key |
| `ZIMRA_GATEWAY_URL`, `ZIMRA_DEVICE_MODEL_NAME`, `ZIMRA_DEVICE_MODEL_VERSION`, `ZIMRA_SUBMIT_RECEIPT_PATH`, `ZIMRA_USE_SUBMIT_RECEIPT_EXT` | Gateway overrides and the legacy path |
| `ZIMRA_VD_EMAIL`, `ZIMRA_VD_PASSWORD` | Legacy Axis virtual device only. Not needed with `FISCAL_BACKEND=service` |

### Do NOT set in production

`OFFLINE_MONGODB_URI` (dev only), all `TEST_*` and `FISCAL_TEST_*`, `STRESS_*`, `POS_SIM_ALLOWED_HOSTS`, `ACTIVATION_KEY`, `AXIS_MULTI_*`, `ATLAS_CLUSTER_HOST`, `STOCKFLOW_SOURCE_URI`, `STOCKFLOW_TARGET_URI`. Your `.env.local` also holds names the code never reads (`MONGO_DB_PASSWORD`, `NEXT_AUTH_SECRET` with an underscore, `REDIS_HOST`, `REDIS_PORT`, `UPSTASH_*`, `PAYMENT_HUB_URL`, `AUTH_*` duplicates): leave them out.

## 4. Environment variables: the fiscal service

Source: `fiscal-service/src/main.ts` and `fiscal-service/.env.example`.

| Variable | Required | What to set |
|---|---|---|
| `FISCAL_MONGODB_URI` | yes | Atlas URI for the **service** database |
| `FISCAL_MONGODB_DB` | no | Defaults to `fiscal_service` |
| `FISCAL_SERVICE_TOKEN` | yes | Same value as the app's. 16+ characters, 64 hex characters recommended |
| `FISCAL_ENCRYPTION_KEY` | yes | Base64 of 32 random bytes. Encrypts the device certificates and keys stored in the service database. **Back it up separately from the database** |
| `FISCAL_ENCRYPTION_KEY_ID` | no | Label for key rotation |
| `PORT` | no | Defaults to 4100. Most hosts inject their own; the service honours it |

The service starts refusing to run if `FISCAL_MONGODB_URI` or `FISCAL_SERVICE_TOKEN` is missing. The ZIMRA environment (test or production) is **per device**, set when the device is added (default `test`), not by a variable.

## 5. Deploy the fiscal service

Pick one always-on host. Any of these work with the supplied `fiscal-service/Dockerfile`:

| Option | Fit |
|---|---|
| **Railway** or **Render** (web service from Dockerfile) | Simplest. Paid plan, because free tiers sleep, and a sleeping fiscal service means no receipts |
| **Fly.io** | Good control over region and a single machine |
| **A VPS** (Hetzner, DigitalOcean, local data centre) with Docker | Cheapest and a fixed IP. You manage updates and the firewall |

Steps (host-independent):

1. [ ] Create the service from the repo with **root directory `fiscal-service`** and the Dockerfile (Node 22, port 4100, runs `tsx src/main.ts`).
2. [ ] Set the four required variables from section 4.
3. [ ] **Exactly one instance, no autoscaling.** If the host offers it, deploy with "stop old, then start new" so two copies do not overlap. An overlap is safe (the database lease stops the second writer) but raises a `LEASE_LOST` alert.
4. [ ] Health check path `/health` (no auth, returns `{ ok: true }`). Every other path needs `Authorization: Bearer <token>`.
5. [ ] Expose it over **HTTPS** (all the hosts above give you a certificate). The bearer token is the only protection, because Vercel's outbound IPs change and cannot be allow-listed. Keep the token long and never log it.
6. [ ] Region: pick the one closest to Zimbabwe that the host offers. The service talks to ZIMRA constantly.
7. [ ] Host clock on NTP (managed hosts already are). A wrong clock causes bad signatures.
8. [ ] Outbound HTTPS to ZIMRA must work. Check from the host's shell or logs that the service can reach `fdmsapitest.zimra.co.zw`; a firewalled host fails every receipt.
9. [ ] Verify: `curl https://fiscal.<domain>/health` returns `{"ok":true}`; the same call to `/v1/devices` without a token returns 401; the logs show `engines started: 0` on first boot.
10. [ ] Stop the service only with SIGTERM (hosts do this on deploy). That hands the device leases back.

## 6. Deploy the app on Vercel

1. [ ] Import the repo as a Vercel project (framework Next.js, root directory is the repo root). `vercel.json` already declares the three crons.
2. [ ] **Plan matters for crons.** `pos-queue` and `fiscal-schedule` run every minute (`* * * * *`). On the Hobby plan Vercel only allows crons once a day and rejects the deployment. Use **Pro**, or replace those two with an external scheduler (for example cron-job.org) calling `GET https://app.<domain>/api/cron/pos-queue` and `/api/cron/fiscal-schedule` every minute with header `Authorization: Bearer <CRON_SECRET>`. `cert-expiry` is daily.
3. [ ] Several routes set `maxDuration = 60`, which also needs a plan that allows 60 s functions (Pro).
4. [ ] Add every variable from section 3 for the **Production** environment, then deploy. Redeploy after any `NEXT_PUBLIC_*` change.
5. [ ] Region: set the function region near your Atlas cluster.
6. [ ] Add the custom domain, then update Clerk, OAuth callbacks and the `*_URL` variables to it.

## 7. Smoke test after deploy (do this before the client sees it)

- [ ] Open the app URL: sign-in page loads, no console errors.
- [ ] Sign in with an email in `BOOTSTRAP_ADMIN_EMAILS` and `BOOTSTRAP_ADMIN_PASSWORD` (creates the first admin on an empty database; see `docs/LIVE_DB_RESET.md` for fresh-database setup and `docs/TEST_USERS.md` for roles).
- [ ] In Vercel > Cron Jobs, press "Run" on `pos-queue` and `fiscal-schedule`: both return `success: true`, not 401/503.
- [ ] Settings > company profile: client's legal name, TIN, VAT number, address are right.
- [ ] Create a branch, a till, and a cashier. Sign in as the cashier on the till.
- [ ] Fiscal devices > **Add device** with a ZIMRA **test** certificate zip (device must be `FiscalDayClosed`; probe it read-only first: `cd fiscal-service && npx tsx scripts/e2e-live.ts "<certs>" <id>`). The wizard pushes the certificate to the service and verifies it with ZIMRA. **Make central** if it is the shop device.
- [ ] Fiscal Day: the device shows its state; open the day; ring one sale; confirm a fiscal QR on the slip and that "Today's totals check" matches.
- [ ] Stop the fiscal service on purpose and ring a sale: the till still completes it and it shows UNFISCALISED; start the service and watch it go through (proves rule 4: a sale is never lost).
- [ ] Trigger an alert email and confirm it arrives (proves SMTP and `FISCAL_ALERT_EMAILS`).
- [ ] Close the day from Fiscal Day and check the Z-report prints.
- [ ] Run `BASE_URL=https://app.<domain> npm run verify:ui` only against a staging copy with seeded test accounts, not against the client's data.

## 8. Ready-for-client checklist

- [ ] The **go-live rehearsal has never been completed end to end** (`docs/AGENT_HANDOFF.md` section 7). Do it once on real ZIMRA test devices using `docs/REHEARSAL_RUNBOOK.md` before handing over. Use only closed, clean devices; a Red receipt cannot be undone and the day then needs closing on the ZIMRA portal.
- [ ] Get the client **their own ZIMRA test devices** (or confirm they will use shared ones) so their tests do not collide with yours.
- [ ] Give the client the tester plan `docs/STOCKFLOW_TEST_PLAN_v2.0.docx` (389 cases) and real accounts for each role (admin, branch manager, cashier). Never share your dev accounts.
- [ ] Do **not** run `seed:test`, `pos:demo`, `pos-seed-test-accounts` or the reset scripts against production. The demo scripts refuse when `NODE_ENV=production`, but do not rely on that.
- [ ] Tell the client plainly: this environment fiscalises against the ZIMRA **test** gateway, so receipts have no legal fiscal standing.
- [ ] Agree who watches alerts and who can close a day on the ZIMRA portal if one gets stuck (`docs/FISCAL_RUNBOOK.md` section 3).
- [ ] Write down where each secret lives and who holds the Vercel, Atlas, Clerk, fiscal-host and domain logins.
- [ ] Monitoring: an uptime check on `https://fiscal.<domain>/health` and on the app, alerting to a phone or email. A down fiscal service is invisible until a receipt queues.

## 9. Known gaps to be honest about

- Fiscal service has no IP allow-list; a long bearer token over HTTPS is its only protection.
- Axis virtual-device licence is "pending", so the `legacy` backend and Playwright POS specs cannot be used. That is why this checklist sets `FISCAL_BACKEND=service`.
- Shop credit and debit notes are refused by design; they exist only at the till.
- `next.config.ts` ignores TypeScript build errors (see section 1).
- Moving to **live** ZIMRA later is a separate step: devices must be added as `production`, the app's production-URL toggle turned on, and the rehearsal repeated. Do not do it as part of client testing.
