# Simplification work: test sheet

Covers everything changed on branch `commerce-platform` from commit `59004a4` onward (security guards, setup wizards, tills, cashier screen, menu access, renames and labels).
Mark each row **P** (pass), **F** (fail) or **N** (not tried), and write what you saw in Notes for any F.

Nothing in this list has been run in a browser by the person who built it. Expect to find rough edges, and treat every F as useful.

## 0. Before you start

| # | Step | Expected |
|---|---|---|
| 0.1 | Start MongoDB (see `docs/POS_TEST_CHECKLIST.docx` section 0 for the `mongod` workaround) and run `npm run dev`. | App loads at http://localhost:3000. |
| 0.2 | Sign in as an **admin**. Test accounts and passwords are in `docs/POS_TEST_CHECKLIST.docx` section 0.3. | You land on the dashboard. |
| 0.3 | Have ready: a ZIMRA certificate **zip** for a test device, or a Device ID + serial + activation key. | n/a |
| 0.4 | Know whether `BOOTSTRAP_ADMIN_EMAILS` is set. If it is empty, any admin counts as a super admin. | n/a |

Run `node scripts/check-api-guards.mjs` once. Expected: `All non-public API routes have an auth check.`

## 1. Security (do this first, signed out)

Open a private window with no session and request each address. Expected for all: sign-in redirect, `401`, `403` or `404`, and **never** data.

| # | Address | Expected | P/F | Notes |
|---|---|---|---|---|
| 1.1 | `/api/accounts` | refused | | |
| 1.2 | `/api/accounts/<any id>` (GET) | refused | | |
| 1.3 | `/api/users/email` (POST `{"email":"x@y.z"}`) | refused, no user record returned | | |
| 1.4 | `/api/seed/roles` (POST) | refused | | |
| 1.5 | `/api/products/export?startDate=2026-01-01&endDate=2026-12-31` | refused | | |
| 1.6 | `/api/upload?storeId=<any id>` | refused | | |

Signed in as a **branch manager** (`branch_user`):

| # | Check | Expected | P/F | Notes |
|---|---|---|---|---|
| 1.7 | `/api/accounts` | refused (admin only) | | |
| 1.8 | `/api/products/export/branch?branchId=<a branch in ANOTHER store>&startDate=...&endDate=...` | refused (403) | | |
| 1.9 | Open `/users`, `/branches`, `/pos-settings`, `/access` | redirected to the dashboard each time | | |

## 2. Add branch wizard (admin)

Go to **Branches**.

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 2.1 | The page shows one "Add branch" button and a one-line explanation. No search box. | No "No pokemon found" text anywhere. | | |
| 2.2 | Click **Add branch**. Type name `Branch 2`, leave location empty, press Continue. | Stays on step 1 and shows "Add the town or suburb." | | |
| 2.3 | Type name `Br@nch`. | Shows the letters/numbers message. | | |
| 2.4 | Name `Branch 2`, location `Harare CBD`. Continue. | Step 2 of 4, progress bar advances. | | |
| 2.5 | Step 2 with **no** extra devices created. | "Give it its own device" is greyed out and says you have none yet. "Use the central device" is selected. | | |
| 2.6 | Continue to step 3. Use + and − on tills. | 1 is the minimum; the number changes. | | |
| 2.7 | Choose **Up to** and type `abc` hours, Continue. | Error asking for 0.25 to 720 hours. | | |
| 2.8 | Choose **No limit**. Continue. | The hours box is disabled and step 4 opens. | | |
| 2.9 | Step 4: the **Receipt code** is pre-filled (for example `BH` or `BC`). Address is pre-filled with the location. Type a new code `B2`. | Hint line shows `B2U0001`. | | |
| 2.10 | Click **Create branch**. | Summary lists: branch created, point of sale on, tills ready, ZIMRA device, offline setting, receipt numbers. | | |
| 2.11 | Click **Done**. | The new branch appears in the table without a page refresh. | | |
| 2.12 | Open **POS settings** for the new branch. | POS is on, prefix `B2`, offline limit shows "no limit", tills exist. | | |
| 2.13 | Repeat 2.4 to 2.10 using a code that **another branch already has**. | Stays on step 4 with "Another branch already uses this prefix". Fix the code, click Create again. **Only one** branch of that name exists afterwards. | | |
| 2.14 | Create a second branch with the same name and location as an existing one. | Returns to step 1 with the "may already exist" message. | | |

## 3. Add device flow (admin)

Go to **Fiscal devices**.

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 3.1 | With no devices yet. | Empty state mentions the central device and the Add device button. | | |
| 3.2 | Click **Add device**. Leave the name empty, Continue. | Asks for a name. | | |
| 3.3 | Name `Axis test 1`, keep **Test device**. Open "Use a different ZIMRA address" and type `ftp://x`. Continue. | Error: address must start with http:// or https://. Clear it. | | |
| 3.4 | Continue to step 2. Choose **I have the zip**. Click Continue without a file. | Asks you to choose the zip. | | |
| 3.5 | Choose a file that is not a `.zip`. | Toast: not a .zip file. | | |
| 3.6 | Drag a certificate zip onto the box. | The box turns green and shows the file name. | | |
| 3.7 | Continue. | Three stages run in order: saving, installing certificate, checking the connection. Each ends with a tick. | | |
| 3.8 | On success. | Shows Device ID and serial number, "Axis test 1 is connected", and a **Choose branches** link. | | |
| 3.9 | Click **Done**. | The device is in the table with a certificate chip showing days left. | | |
| 3.10 | Open the device with **Settings**. | Automatic open and close is switched **on** (new devices default to it). | | |
| 3.11 | Add another device using a **wrong** zip (or one for a different device). | The stage that failed shows its message, **Try again** appears, the earlier stages stay ticked. | | |
| 3.12 | Click **Try again** after correcting the situation (or disconnecting the network to force the last stage to fail). | Resumes at the failed stage and does not create a second device. | | |
| 3.13 | Add a device with **I have an activation key** (Device ID, serial, key). | Registers, installs the certificate, checks the connection. Skip if you have no key. | | |
| 3.14 | On the device row click **New certificate**, drop a new zip, **Install certificate**. | Shows "New certificate installed" with the new expiry date, then the connection check result. | | |
| 3.15 | Open **Add branch** again. | Step 2 now offers "Give it its own device" and lists the new device. Pick it and finish creating a branch. | | |
| 3.16 | POS settings, then the top panel **Which device does each branch use?** | The new branch shows the device you chose. | | |

## 4. Tills (admin)

Go to **POS settings** and pick a branch.

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 4.1 | Look at the Tills section. | No "Number of tills" box or Apply button. There is an **Add a till** button. | | |
| 4.2 | Click **Add a till**. | New till appears ("Till 2" or next number), status **Ready**. | | |
| 4.3 | Switch a till off. | Status chip changes to **Off**. | | |
| 4.4 | Turn the branch's **Point of sale** off and Save. | Banner: "Point of sale is off for this branch". On-tills show "Waiting for point of sale to be switched on". | | |
| 4.5 | Turn it on and Save. | Chips go back to Ready. | | |
| 4.6 | Rename a till and click elsewhere. | Name is kept after refresh. | | |
| 4.7 | Fiscal device line in the settings form. | Shows the current device name (or Central device) and says where to change it. No second dropdown. | | |
| 4.8 | **Regression:** make a sale while the till is online, then switch that till off, then sync an offline sale made on it earlier. | The offline sale still syncs. Do this only if you can run the offline test from `tests/e2e/pos.spec.ts` or the manual offline steps in the old POS checklist. | | |

## 5. Cashier screen

Sign in as a **cashier** first, then as an **admin** on the same till.

| # | Check | Cashier expected | Admin expected | P/F | Notes |
|---|---|---|---|---|---|
| 5.1 | Top bar | No fiscal device or day indicator | Indicator visible | | |
| 5.2 | Main button | "Issue invoice & print" | same | | |
| 5.3 | Empty cart hint | "Press F12 to issue the invoice and print." | same | | |
| 5.4 | Sales button label when something is waiting to be sent | "Today's sales" | "N awaiting fiscalisation" | | |
| 5.5 | Complete a normal sale. | Shows "Invoice issued" with the number. | same | | |
| 5.6 | Stop the fiscal device or block ZIMRA, then sell. | Sale completes. Toast says "Invoice saved. The final tax invoice is sent automatically." Result says "Invoice saved. The final copy follows automatically". No mention of fiscal device or provisional. | same toast; admin can still see the indicator turn red/amber | | |
| 5.7 | Open **Today's sales**. | Badges read Issued, Saved sending, Sending or Needs attention. No **Fiscalise** button. | **Fiscalise** button visible on unsent sales | | |
| 5.8 | Search for the words "fiscal", "ZIMRA", "provisional" in the cashier's whole screen. | Only the printed receipt may carry them. | n/a | | |
| 5.9 | Cut the network entirely and sell. | The red "Server unreachable: selling offline" banner still appears for the cashier. Sale is saved and prints a numbered slip. | same | | |
| 5.10 | Click **Today's sales** with an offline sale queued. | Row says it is saved on this till. Print works. | same | | |
| 5.11 | Try `/dashboard` as cashier. | Redirected to `/pos`. | n/a | | |
| 5.12 | Receipts and A4 invoice. | Still say "Fiscal tax invoice" and carry the QR code and device details once fiscalised. | | | |

## 6. Fiscal day opens by itself

Use a test device. This checks `2ccde0e`.

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 6.1 | On the device, turn **Auto schedule** and **Automatic open** on, with an open time that has already passed today and today an open weekday. Close the fiscal day on the **Fiscal day** page. | Day shows closed. | | |
| 6.2 | Make a cashier sale. | Sale completes as "Invoice saved". | | |
| 6.3 | Wait for the next queue run (up to a minute with the cron running, or call `/api/cron/pos-queue` with the cron secret). | The day opens by itself and the sale is fiscalised. | | |
| 6.4 | Turn **Automatic open** off, close the day, sell, wait a minute. | The day stays closed and the sale stays waiting. | | |
| 6.5 | Set the open time to a time later today and repeat 6.1 to 6.3. | The day does **not** open before that time. | | |
| 6.6 | Uses the fiscal service backend (`FISCAL_BACKEND=service`)? | This change does nothing there by design. | | |

## 7. Menu access (admin and branch manager)

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.1 | As a **super admin**, look at the sidebar. | A **Menu access** entry appears at the bottom. | | |
| 7.2 | As an admin who is **not** a super admin (only if `BOOTSTRAP_ADMIN_EMAILS` is set and does not include them). | No Menu access entry. Opening `/access` shows the screen read-only with a note. | | |
| 7.3 | Open **Menu access**. | Shows Admin and Cashier as fixed, and a Branch manager card with a count such as "Sees N of N pages" (N is how many pages a branch manager can use). | | |
| 7.4 | Click **Sales focus**. | Dashboard and the point of sale pages stay on, the rest turn off. The Sales focus button looks selected. The save bar slides up. | | |
| 7.5 | Click **Discard**. | Back to the saved setup and the save bar slides away. | | |
| 7.6 | Click **Sales focus** again then **Save changes**. | Toast confirms. Save bar goes away. | | |
| 7.7 | Sign in as a **branch manager** in another browser. | Menu shows only the dashboard and point-of-sale pages. No "Uploads", "Insights" or other headings that are now empty. | | |
| 7.8 | Click **Stock focus** as the super admin, save, refresh the branch manager's page. | Menu now shows the stock pages and no point-of-sale pages. | | |
| 7.9 | Click **Everything** and save. Refresh as branch manager. | Full menu returns. | | |
| 7.10 | Try to switch off a page individually and save. | Only that page disappears; count goes down by one. | | |
| 7.11 | As branch manager, type a hidden page's address directly (for example `/products` after hiding it). | **Known limitation:** the page still opens. Record whether it does. The admin-only pages (`/fiscal-devices`, etc.) must still be refused. | | |
| 7.12 | Fiscal, Users, Branches, POS settings. | Never appear in the branch manager's menu or in the Menu access list. | | |

## 8. Names and labels

| # | Where | Expected | P/F | Notes |
|---|---|---|---|---|
| 8.1 | Sidebar | Upload history, Upload stock, Stock products, Branch upload status, Fiscal day, Central device, Day-end reports. No "Downloads" heading. "Ask AI" sits under Insights. | | |
| 8.2 | Each page heading | Matches its menu entry (Upload history, Branch upload status, Fiscal day, Day-end reports (Z-reports), Central device settings). | | |
| 8.3 | **Stock products** | Card reads "Out of stock" with "Products with no units left". Filter tab and badge read "Out of stock". | | |
| 8.4 | Hover the filter tabs | Each shows its rule (Low Stock: fewer than 10 units, High Value: top 25%, Inactive: marked inactive). | | |
| 8.5 | **Branch Analytics** and **Product sales trend** charts (menu entry was "Product Movement") | Subtitle explains that sales are estimated from the drop in stock between uploads and that restocking can hide sales. | | |
| 8.6 | **Central device** vs the Add branch wizard | The same term is used in both. Nobody calls it "shared device". | | |
| 8.7 | **Dashboard** cards | Read "Products in stock", "Stock value", "Estimated sales, all time", "Branches", each with a line saying where the number comes from. The menu entry and heading say "Product sales trend" for the old Product Movement page. | | |

## 9. Removed things stay removed

| # | Check | Expected | P/F | Notes |
|---|---|---|---|---|
| 9.1 | Open `/dashboard-2` | 404 | | |
| 9.2 | Open `/archived-reports` | 404 | | |
| 9.3 | Open `/dashboard` | Works as before. | | |

## 10. Automated checks

| # | Command | Expected | P/F | Notes |
|---|---|---|---|---|
| 10.1 | `node scripts/check-api-guards.mjs` | Passes. | | |
| 10.2 | `npx playwright test tests/e2e/pos.spec.ts` | Passes with the new wording ("Invoice issued", "Invoice saved. The final copy follows automatically"). Needs a test device and the `.env.test` accounts. | | |
| 10.3 | `npx playwright test tests/e2e/pos-supervisor.spec.ts` | Passes; the sales row says "Issued". | | |

## 11. Things you decide

Record your answer here so the next round can act on it.

| # | Question | Your answer |
|---|---|---|
| 11.1 | **Cross-day sales.** Auto-approve a sale from an earlier day when it is within the offline limit? This moves its revenue into the current fiscal day. Nothing is built yet. | |
| 11.2 | **Per-branch open/close times.** Today the schedule belongs to the device, so two branches on the central device share times. Should each branch get its own times? | |
| 11.3 | **Hidden pages by address.** Should a hidden page also refuse a branch manager who types its address? | |
| 11.4 | Did the wizards feel quicker than the old screens? What slowed you down? | |

## Not covered by this sheet

- The e-commerce shop and quotations (untouched on purpose).
- The `posSale.service.ts` and `constants/constants.ts` edits that were already in your working tree before this work.
- Renewing the ZIMRA device certificate that is still in git history.
