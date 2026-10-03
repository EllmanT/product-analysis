# POS go-live checklist

Work through this top to bottom the first time a branch goes live, then use sections 6 and 7 day to day.

## 1. Environment (production)

| Variable | Why |
|---|---|
| `MONGODB_URI`, `MONGO_DB_NAME` | production database (non-production builds use `OFFLINE_MONGODB_URI` instead) |
| `AUTH_SECRET` (and `AUTH_TRUST_HOST=true` unless on Vercel) | sign-in sessions |
| `ZIMRA_API_URL` (+ `ZIMRA_VD_EMAIL` / `ZIMRA_VD_PASSWORD` if the device needs a login) | the shared virtual fiscal device. For ZIMRA production, point this at the production device, never the test host |
| `CRON_SECRET` | authorises the two scheduled jobs (section 3) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | emailing invoices to customers |
| `STAFF_ALLOWED_EMAILS` | administrators and branch users who may sign in (cashiers are admitted by role) |
| `POS_TIMEZONE` (optional) | defaults to `Africa/Harare`; defines "the same fiscal day" for automatic retries |

The fiscal device must list the VAT rate you charge (15.5% is standard rated, taxID 517, on the test device). Check with `GET {device}/api/VirtualDevice/GetConfig`.

## 2. Database

- Seed roles: `npm run seed:roles:live` (adds `cashier` next to `admin` and `branch_user`).
- Indexes are created by Mongoose on first use (unique branch prefix, invoice and provisional numbers, idempotency keys).

## 3. Scheduler (required)

Two jobs must run every minute with `Authorization: Bearer <CRON_SECRET>`:

- `GET /api/cron/pos-queue`: retries unfiscalised sales (same fiscal day) and reconciles sales whose result was unknown.
- `GET /api/cron/fiscal-schedule`: automatic open/close of the shared fiscal day (the close waits up to 2 hours while POS sales are unfiscalised).

On Vercel this is configured in `vercel.json` (per-minute cron needs a Pro plan; the CRON_SECRET is attached automatically). Elsewhere run `npm run pos:cron` under a process manager, or call the URLs from any scheduler. Without these jobs, provisional sales are never retried and the day never opens or closes by itself.

In Admin → Fiscal settings turn on the automatic schedule and set the open/close times.

## 4. Per branch

1. Admin → **POS settings**: pick the branch, enable POS, set the invoice **prefix** (e.g. `H`), VAT %, default currency, offline limit (hours or none) and the receipt details (company name, branch, address, phone, email, TIN, VAT number, logo, footer lines).
2. Click **Print test slip** on the real slip printer and check width, margins, cut and the QR.
3. Admin → **POS products**: add products, paste a list, or **Import from latest stock upload**; check the USD prices and set fixed ZWG prices or "price at till" where needed. Make sure an exchange rate for ZWG exists (Exchange rates page).
4. Admin → Users: create a **Cashier (POS)** user per till, assigned to the branch. Create supervisors as branch users (they can issue credit notes) if wanted.
5. Till PC: set up Chrome as in `POS_TILL_SETUP.md` (default printer, `--kiosk-printing`), sign in once while online so the till and product list are saved for offline use.

## 5. Acceptance run on the real device before opening

- Sell one cheap item in USD and in ZWG: slips print with QR and the numbers look right (`HU0001`, `HZ0001`).
- Switch the till PC off the network, sell, print the provisional slip, reconnect, and confirm the sale syncs and fiscalises (the badge disappears).
- Issue a credit note on one test sale (supervisor) and confirm the slip.
- Email one invoice to yourself.
- From a second branch, sell at the same moment (both must succeed).
- Check **POS sales** shows both branches and the totals agree with the slips.

Test receipts reach the device and cannot be deleted: do the acceptance run on the **test** device first, then switch `ZIMRA_API_URL` to production and sell one real item to confirm.

## 6. Daily operation

- The shared fiscal day opens/closes on the schedule. The Fiscal Day page shows its state and offers a manual open/close; the close refuses (with a "Close anyway") while today's POS sales are unfiscalised.
- Watch the amber "awaiting fiscalisation" badge on tills and the "Needs attention" strip on **POS sales**. Sales from an earlier day need an administrator to fiscalise them there.
- Do not sign a till out while its "saved on this till" badge is showing.

## 7. If something goes wrong

| Symptom | Meaning / action |
|---|---|
| Red "Fiscal device unreachable" on the till | Sales continue with provisional slips and are fiscalised automatically once the device is back (cron job running?) |
| Red "Server unreachable: selling offline" | The till has no connection to the app; sales are kept on the PC and sent when it returns (limit per branch) |
| "Session expired. Sign in again to send N saved sales" | Sign in again; nothing is lost |
| Sale "Rejected" with a message | The device refused it (validation); fix the cause and re-ring the sale |
| Day will not close: "N POS sales are not fiscalised yet" | Fiscalise them from POS sales, or "Close anyway" (they then need admin approval later) |
| Device clock/day limit | A fiscal day may not stay open past the device's limit (24 h on the test device); keep the close schedule |
