# Step-by-step: deploy StockFlow (Vercel) and the fiscal service (Render), free tiers

Written 2026-11-08 for the client-testing release. Companion to `docs/PRODUCTION_CHECKLIST.md` (the full list of what must be true) and the two blank variable files in `docs/env/`. Everything here fiscalises against the ZIMRA **test** gateway only.

## 0. Decisions already made

**One GitHub repo, two deployments. Do not split the repo.** Both hosts can build from a sub-folder of the same repo:

| Deployment | Host | Root directory in the host | Builds with |
|---|---|---|---|
| StockFlow app | Vercel (free "Hobby") | repo root (`.`) | `npm run build` (Next.js, automatic) |
| Fiscal service | Render (free web service) | `fiscal-service` | `fiscal-service/Dockerfile` |

Why not a second repo: the fiscal service has no code shared with the app (checked: it imports nothing from outside its folder), but the app's end-to-end test (`npm run test:service-backend`) starts the service from the same checkout, and one repo keeps the two versions in step. Render's **Root Directory** and **build filter** give you the same isolation as a separate repo: pushing an app-only change will not rebuild the service.

**Free-tier consequences you must know about:**

| Limit | What it means | What we do |
|---|---|---|
| Render free web services **sleep after 15 minutes without traffic** (a cold start takes about a minute) | A sleeping fiscal service opens no days, closes no days and sends no queued receipts | A free uptime pinger hits `/health` every 5 minutes (step 5). The app's own per-minute scheduler also calls the service |
| Vercel Hobby only allows **one cron run per day** and rejects a deployment that asks for more | `vercel.json` now holds only the daily certificate-expiry job. The two per-minute jobs (till retry queue and fiscal day open/close) must come from outside | A free external scheduler calls them every minute (step 6) |
| Vercel Hobby is for **non-commercial** use | Fine while you are testing with the client. Upgrade before real trading | Plan to move to Pro |
| MongoDB Atlas free (M0) has **no backups** and 512 MB | Fine for testing; not for real receipts | Upgrade to M10 before going live |
| Render free: 512 MB RAM, one instance | Enough for the service. Keep it at exactly one instance | Nothing to do |

## 1. One-time preparation (about 30 minutes)

1. **GitHub**: confirm `master` on `https://github.com/EllmanT/product-analysis` has your latest push (it does after this commit).
2. **Make secrets.** In PowerShell (Node is already installed):
   ```
   node -e "const c=require('crypto');console.log('AUTH_SECRET=',c.randomBytes(32).toString('base64'));console.log('APP FISCAL_ENCRYPTION_KEY=',c.randomBytes(32).toString('base64'));console.log('SERVICE FISCAL_ENCRYPTION_KEY=',c.randomBytes(32).toString('base64'));console.log('CRON_SECRET=',c.randomBytes(32).toString('hex'));console.log('FISCAL_SERVICE_TOKEN=',c.randomBytes(32).toString('hex'))"
   ```
   Paste the five values straight into a password manager. Two different encryption keys. Never put them in chat or git.
3. **MongoDB Atlas** (one free M0 cluster is enough for both databases):
   - Database Access > add two users: `stockflow_app` and `fiscal_service` with strong passwords, each with read/write on **its own** database only (`stockflow` and `fiscal_service`).
   - Network Access > add `0.0.0.0/0` (Vercel and Render have changing IPs; the passwords protect it).
   - Connect > Drivers > copy the connection string for each user. Build two URIs: one ending `/stockflow?retryWrites=true&w=majority`, one `/fiscal_service?retryWrites=true&w=majority`.
4. **Clerk** (sign-in wrapper): for this testing phase use your existing Clerk **development** instance keys. They work on a `*.vercel.app` address. A production Clerk instance needs your own domain; switch when you have one.
5. **Email**: have SMTP details ready (host, port, user, password, from address). Without email, fiscal alert emails will not arrive.

## 2. Deploy the fiscal service on Render (do this first, the app needs its URL)

1. Go to <https://dashboard.render.com>, sign in with GitHub, and grant Render access to the `product-analysis` repo.
2. **New +** > **Web Service** > pick the `product-analysis` repo > **Connect**.
3. Fill the form:

   | Field | Value |
   |---|---|
   | Name | `stockflow-fiscal` (this becomes `https://stockflow-fiscal.onrender.com`) |
   | Region | **Frankfurt** (nearest to Zimbabwe among Render's regions; if Frankfurt is not offered, pick the nearest Europe region) |
   | Branch | `master` |
   | Root Directory | `fiscal-service` |
   | Language / Runtime | **Docker** (Render finds `fiscal-service/Dockerfile`) |
   | Instance Type | **Free** |

4. Open **Advanced** and set:
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: Yes, and under **Build Filters** > Included Paths add `fiscal-service/**` so app-only pushes do not redeploy the service.
5. **Environment Variables** (add each; values from your password manager, see `docs/env/fiscal-service.production.env.template`):

   | Key | Value |
   |---|---|
   | `FISCAL_MONGODB_URI` | the `fiscal_service` Atlas URI |
   | `FISCAL_MONGODB_DB` | `fiscal_service` |
   | `FISCAL_SERVICE_TOKEN` | the 64-hex token |
   | `FISCAL_ENCRYPTION_KEY` | the **service** encryption key |
   | `PORT` | `10000` (Render's default port; the service reads `PORT`) |

6. **Create Web Service.** Watch the log. The Docker build takes a few minutes. Success looks like:
   ```
   engines started: 0
   fiscal-service listening on 10000
   ```
   and Render marks the service **Live**.
7. Test from your computer (PowerShell; replace the URL):
   ```
   curl https://stockflow-fiscal.onrender.com/health
   curl -i https://stockflow-fiscal.onrender.com/v1/devices
   ```
   First returns `{"ok":true}`. Second must return **401** (no token). If the first call is slow the very first time, that is the cold start.
8. Never scale beyond 1 instance. If you ever see a `LEASE_LOST` alert, a second copy is running: stop it.

## 3. Deploy the app on Vercel

1. <https://vercel.com> > sign in with GitHub > **Add New** > **Project** > import `product-analysis`.
2. Framework preset: **Next.js** (detected). Root Directory: leave as `./`. Build command and output: leave the defaults (`npm run build`).
3. Open **Environment Variables** and add every variable from `docs/env/app.production.env.template` for **Production**. For this first deploy, the ones that need an address can be filled in after step 5. Minimum for the build and first start:

   - `MONGODB_URI` (the `stockflow` URI), `MONGO_DB_NAME` = `stockflow`
   - `AUTH_SECRET`, `CRON_SECRET`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - `BOOTSTRAP_ADMIN_EMAILS`, `STAFF_ALLOWED_EMAILS` (your email, and the client's admin email)
   - `FISCAL_BACKEND` = `service`, `FISCAL_SERVICE_URL` = `https://stockflow-fiscal.onrender.com`, `FISCAL_SERVICE_TOKEN` = same as Render, `FISCAL_ENCRYPTION_KEY` = the **app** key
   - `POS_TIMEZONE` = `Africa/Harare`
   - `SMTP_*`, `ADMIN_EMAIL`, `INVOICE_COMPANY_*`, `INVOICE_DEFAULT_*`
   - Leave out `OFFLINE_MONGODB_URI`, all `TEST_*` variables, and `NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED`.

4. **Deploy.** The build takes a few minutes. Because `next.config.ts` ignores TypeScript errors, a green build does not prove the types are clean: you ran `tsc --noEmit` yourself (checklist section 1).
5. When it finishes you get `https://<project>.vercel.app`. Now set these four to that address and **redeploy** (Deployments > the latest > Redeploy), because `NEXT_PUBLIC_*` are baked in at build time:
   `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`.
6. In the Clerk dashboard, add the `*.vercel.app` address as an allowed origin/redirect if prompted.
7. If you use Google or GitHub sign-in, add the callback `https://<project>.vercel.app/api/auth/callback/google` (and `/github`) to those OAuth apps and set `AUTH_GOOGLE_*`/`AUTH_GITHUB_*`. If not, tell testers to use email and password.

## 4. First sign-in and first device

1. Open the Vercel address and sign in with an email in `BOOTSTRAP_ADMIN_EMAILS` (register first if the database is empty).
2. Settings: set the company profile (legal name, TIN, VAT number, address).
3. Create a branch, then a till, then a cashier.
4. Fiscal devices > **Add device** with a ZIMRA **test** certificate zip. Only use a device whose day is `FiscalDayClosed` (probe it read-only first, see `docs/FISCAL_RUNBOOK.md` section 3). The wizard sends the certificate to Render and verifies it. **Make central** if it is the shop device.

## 5. Keep the fiscal service awake (free uptime monitor)

1. Create a free account at <https://uptimerobot.com> (or cron-job.org).
2. New monitor: type **HTTP(s)**, URL `https://stockflow-fiscal.onrender.com/health`, interval **5 minutes**.
3. Add an alert contact (your email or phone). This also tells you if the service is down.

## 6. Run the two per-minute jobs from outside Vercel

1. Create a free account at <https://cron-job.org>.
2. Create two cron jobs, each **every 1 minute**, method **GET**, with this header:
   `Authorization: Bearer <CRON_SECRET>`

   | Title | URL |
   |---|---|
   | stockflow pos-queue | `https://<project>.vercel.app/api/cron/pos-queue` |
   | stockflow fiscal-schedule | `https://<project>.vercel.app/api/cron/fiscal-schedule` |

3. Run each once by hand ("Test run"): the reply must contain `"success":true`. `401` means the secret does not match; `503` means `CRON_SECRET` is not set in Vercel.
4. When you upgrade Vercel to Pro, add the two per-minute entries back to `vercel.json` (`* * * * *` for `/api/cron/pos-queue` and `/api/cron/fiscal-schedule`) and delete the cron-job.org jobs.

## 7. Prove it works (run `docs/PRODUCTION_CHECKLIST.md` section 7)

Short version: ring a sale on a till and see the fiscal QR; stop the Render service (Manual deploy > suspend) and ring another sale, confirm it is saved as unfiscalised; resume the service and watch it clear; close the day; print the Z-report.

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Render log: `FISCAL_MONGODB_URI and FISCAL_SERVICE_TOKEN are required.` | A variable is missing or misspelt. Fix it in Render > Environment and let it redeploy |
| Render log: connection or authentication error to MongoDB | Atlas user/password wrong, URI database name wrong, or `0.0.0.0/0` not added |
| Render deploy fails with "port scan timeout" | `PORT` not `10000`, or the service crashed at start. Read the log above that line |
| Vercel deploy fails: "cron expression would run more than once per day" | `vercel.json` has per-minute crons. It should contain only `cert-expiry` (this commit fixes it) |
| App says receipts are queued / fiscal service unavailable | Render is asleep or down (check the monitor), or `FISCAL_SERVICE_URL` has a typo or trailing slash, or the tokens differ (the service answers 401) |
| Sign-in redirects forever or errors | Clerk keys missing, or the address not allowed in Clerk; `AUTH_SECRET` not set |
| Cron test returns 401 or 503 | `CRON_SECRET` differs between Vercel and cron-job.org, or is unset in Vercel (503) |
| Alert `LEASE_LOST` | Two fiscal service copies are running. Keep one |
| Sales stay "waiting" after a long sleep | The scheduler resends in order on wake-up. Check Fiscal Day for alerts; do not resend by hand |

## 9. When to upgrade

- Render to a paid instance as soon as the client does serious testing: no sleep, faster response, steady scheduler.
- Vercel to Pro before real trading (commercial use, per-minute crons inside `vercel.json`).
- Atlas to M10 before any real receipts (backups).
- A production Clerk instance and your own domain before go-live.
