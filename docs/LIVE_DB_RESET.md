# Live MongoDB reset and test-user seed

Use this runbook to wipe the **production** `stockflow` database on Atlas, seed Playwright test users, and test stock uploads on your **deployed** app.

**Warning:** A full reset deletes all data (users, uploads, customers, invoices, shop config, etc.). Take a backup first.

---

## Prerequisites

- [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) installed (for backup)
- `.env.local` at repo root with **`MONGODB_URI`** set to the **same Atlas URI** your production deployment uses
- Optional: `ATLAS_CLUSTER_HOST` — hostname fragment (e.g. `cluster0.xxxxx.mongodb.net`) so the reset script refuses the wrong cluster
- Production host env: **`STAFF_ALLOWED_EMAILS`** must include test emails (see below)

---

## 1. Backup (required)

From repo root (PowerShell example):

```powershell
$date = Get-Date -Format "yyyyMMdd"
mongodump --uri="$env:MONGODB_URI" --db=stockflow --out="./backup-stockflow-$date"
```

Or set the URI inline:

```bash
mongodump --uri="<YOUR_ATLAS_MONGODB_URI>" --db=stockflow --out=./backup-stockflow-YYYYMMDD
```

Store the dump folder somewhere safe.

---

## 2. Inspect live database (dry-run)

Lists every collection and document count; **no writes**.

```bash
npm run reset:live
```

Equivalent:

```bash
node --env-file=.env.local scripts/reset-stockflow-live.mjs
```

---

## 3. Wipe live `stockflow` (destructive)

Drops the entire `stockflow` database on **`MONGODB_URI` only** (never `OFFLINE_MONGODB_URI`).

```bash
npm run reset:live:confirm
```

Equivalent:

```bash
node --env-file=.env.local scripts/reset-stockflow-live.mjs --confirm-live-reset
```

Safety:

- Refuses `127.0.0.1` / `localhost` unless you pass `--allow-local`
- If `ATLAS_CLUSTER_HOST` is set in `.env.local`, the URI hostname must contain that value

---

## 4. Seed test users (live)

Creates the same entities as local `npm run seed:test`:

| Role        | Email                   | Password        |
|-------------|-------------------------|-----------------|
| Admin       | `admin@testbranch.com`  | `Admin@123456`  |
| Branch user | `branch@testbranch.com` | `Branch@123456` |

Plus store **"Test Store (Playwright)"** and branch **"Test Branch"**.

```bash
npm run seed:test:live
```

Save the printed `TEST_STORE_ID` and `TEST_BRANCH_ID` if you need them for scripts or API calls.

---

## 5. Seed roles collection (live)

```bash
npm run seed:roles:live
```

Equivalent:

```bash
node --env-file=.env.local scripts/seed-roles.mjs --target=live
```

---

## 6. Production environment (Vercel / host)

Set or update on your **production** deployment, then redeploy:

| Variable | Value |
|----------|--------|
| `STAFF_ALLOWED_EMAILS` | `admin@testbranch.com,branch@testbranch.com` |
| `MONGODB_URI` | Atlas connection string (unchanged) |
| ` ` | Production origin, e.g. `https://your-app.vercel.app` |
| `NEXTAUTH_SECRET` | Keep existing value |

Without `STAFF_ALLOWED_EMAILS`, sign-in fails with “not authorized to access the staff application” even with correct passwords.

`OFFLINE_MONGODB_URI` is **not** used when `NODE_ENV=production`.

---

## 7. Verify on deployed app

1. Open production **`/sign-in`**
2. Log in as `admin@testbranch.com` / `Admin@123456`
3. Go to **`/uploads/upload`**
4. Upload a file from `test-data/` (CSV: `code,name,qty,price` per line)
5. Check **`/uploads`**, **`/dashboard`**, and analytics

Branch user: `branch@testbranch.com` / `Branch@123456` (scoped to Test Branch).

---

## npm scripts reference

| Script | Action |
|--------|--------|
| `npm run reset:live` | Dry-run: list collections on live DB |
| `npm run reset:live:confirm` | Drop live `stockflow` database |
| `npm run seed:test:live` | Seed test store, branch, users on live |
| `npm run seed:roles:live` | Upsert `roles` on live |
| `npm run seed:test` | Seed local/offline DB (unchanged) |
| `npm run seed:roles` | Seed roles on `MONGODB_URI` or offline URI |

---

## Collections removed by full wipe

All user collections in `stockflow`, including:

- Auth / org: `users`, `accounts`, `roles`, `stores`, `branches`
- Uploads: `uploads`, `uploadproducts`, `productmasters`, `weeklyproductsummaries`
- Shop / commerce: `customers`, `quotations`, `invoices`, `homepageconfigs`, `shoppublicstats`, payment and email settings collections
- Fiscal: `fiscalsettings`, `zreports`

Any extra collections present in Atlas are listed in the dry-run step and removed on confirm.

---

## Shop / Clerk

A full wipe removes **customers** and shop data. Staff upload testing does not require Clerk. Re-create shop customers via Clerk or shop registration if you test the storefront later.

---

## Optional: bulk upload simulation on live

Not required for manual testing. To replay `test-data/week*.txt` against live later, extend `simulate-test-uploads.ts` with `--target=live` (not implemented by default).
