# Till PC setup (80mm slip printer)

The till prints through the browser, so each till PC needs Chrome (or Edge) set up once so that F12 prints straight to the slip printer with no dialog.

1. **Install the printer driver** and set the 80mm slip printer as the Windows **default printer**.
2. In Windows printer preferences set the paper size to **80mm roll** (or the driver's "Receipt" size) and margins to zero. The slip sets `@page { size: 80mm auto; margin: 0 }` itself.
3. **Create a till shortcut** that opens the POS full screen with silent printing:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://YOUR-HOST/pos
   ```

   `--kiosk-printing` skips the print preview and sends the slip to the default printer. `--app` opens the till without tabs or an address bar.
4. Sign in with the cashier account created for that branch (Users screen, role **Cashier (POS)**, assigned to the branch). Cashiers can only reach `/pos`.
5. Test: sell one cheap item, press **F12**, confirm one slip prints and the cursor is back in the product box.

## Keys

| Key | Action |
|---|---|
| Enter (product) | pick the highlighted product, move to quantity (or price for "price at till" items) |
| Enter (quantity) | add the line, back to product |
| **F12** | fiscalise and print (works from any field) |
| F2 | switch USD / ZWG |
| F3 / F4 | jump to product / customer |
| F8 | today's sales (reprint, email, fiscalise unfiscalised sales) |
| F9 | reprint the last slip (marked DUPLICATE) |
| Esc, Esc | clear the sale |
| ↑ ↓ then Delete (product box empty) | select and remove a line |

## When the fiscal device is down

The sale is never blocked. The till prints a **PROVISIONAL RECEIPT** (own number series, e.g. `HUP0001`, "not a fiscal tax invoice") and the sale is fiscalised automatically once the device is back, same fiscal day only. Sales from an earlier day need an administrator to fiscalise them. Set `CRON_SECRET` and call `GET /api/cron/pos-queue` every minute (Authorization: `Bearer <CRON_SECRET>`) to run the automatic retry.

## Email

Customer copies are sent through the existing SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`). Use the envelope button in the sales drawer (F8).

## Working offline

Open the till once while online on each till PC (this lets the browser keep the till and the product list). If the connection to the server drops, the till shows a red "selling offline" banner and keeps working:

- Each sale prints a **PROVISIONAL RECEIPT** with its own number and is saved on the PC.
- When the connection is back the sales are sent automatically and fiscalised; the amber "N saved on this till" badge disappears. Do not sign out or clear browser data while that badge is showing.
- The offline limit (default 5 hours, or none) is set per branch in POS settings.
- Sales made offline on an earlier day need an administrator to fiscalise them (POS sales page).

## Scheduler

Call these every minute with `Authorization: Bearer <CRON_SECRET>`:

- `GET /api/cron/pos-queue` retries unfiscalised sales of the same day and reconciles any whose result was unknown.
- `GET /api/cron/fiscal-schedule` runs the automatic open and close of the shared fiscal day. The close waits (up to 2 hours) while POS sales are still unfiscalised.

## Credit notes (supervisors)

A supervisor (branch user or administrator) can reverse a fiscalised sale in full: press **F8**, find the sale, **Credit note**, add an optional reason, **Issue credit note**. The credit note prints (`HUC0001`...), refers to the original invoice, and the sale shows "credited". It can only be done once per sale. Cashiers do not see the button.

## Checking the printer

Admin → POS settings → **Print test slip** prints a sample slip with the branch's details. Check the width (nothing cut off), margins, that the cutter cuts after the footer, and that the QR scans.

For the complete go-live steps see `POS_GO_LIVE.md`.
