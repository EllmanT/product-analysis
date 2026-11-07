# Simplification work: test sheet

Covers everything changed on branch `commerce-platform` from commit `59004a4` onward (security guards, setup wizards, tills, cashier screen, menu access, renames and labels).
Mark each row **P** (pass), **F** (fail) or **N** (not tried), and write what you saw in Notes for any F.

Nothing in this list has been run in a browser by the person who built it. Expect to find rough edges, and treat every F as useful.

## 0. Before you start

| # | Step | Expected |
|---|---|---|
| 0.1 | Start MongoDB (see `docs/POS_TEST_CHECKLIST.docx` section 0 for the `mongod` workaround) and run `npm run dev`. | App loads at http://localhost:3000. |
| 0.2 | Sign in as an **admin**. Test accounts and passwords are in `docs/POS_TEST_CHECKLIST.docx` section 0.3. | You land on the dashboard. |
| 0.3 | Have ready: the certificate **zip** for two ZIMRA test devices, for example `test certificates/certificates_31728.zip` and `certificates_32160` (zip it). Probe them first: `cd fiscal-service`, `npx tsx scripts/probe-device.ts "../test certificates"`. Use only devices that show `FiscalDayClosed`. | n/a |
| 0.4 | Super admin: `BOOTSTRAP_ADMIN_EMAILS` must contain the email you sign in with (for example `admin@testbranch.com`; separate several with commas). Only those admins see **Menu access**. Only when the setting is empty or missing does every admin count as a super admin. Restart the app after changing it. | n/a |
| 0.5 | Fiscal service: in `fiscal-service` copy `.env.example` to `.env` (set `FISCAL_MONGODB_URI`, `FISCAL_SERVICE_TOKEN`, `FISCAL_ENCRYPTION_KEY`) and run `npx tsx --env-file=.env src/main.ts` (port 4100). In `.env.local` set `FISCAL_BACKEND=service`, `FISCAL_SERVICE_URL=http://127.0.0.1:4100` and the same `FISCAL_SERVICE_TOKEN`. Restart `npm run dev`. Sections 3 and 7g assume this. `FISCAL_BACKEND=legacy` (Axis Virtual Device) is only kept for that device. | n/a |

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
| 3.1 | With no devices yet. | Empty state asks you to upload the certificate zip ZIMRA gave you. There is no **Central device settings** button. | | |
| 3.2 | Click **Add device**. Leave the name empty, Continue. | Asks for a name. | | |
| 3.3 | Name it `ZIMRA test 31728`, keep **Test device**. Look for "Use a different ZIMRA address". | There is no such option with the fiscal service (legacy only). Continue. | | |
| 3.4 | Continue to step 2. Choose **I have the zip**. Click Continue without a file. | Asks you to choose the zip. | | |
| 3.5 | Choose a file that is not a `.zip`. | Toast: not a .zip file. | | |
| 3.6 | Drag a certificate zip onto the box. | The box turns green and shows the file name. | | |
| 3.7 | Continue. | Three stages run in order: saving the device, sending the certificate to ZIMRA to check it, checking the connection. Can take up to a minute. Each ends with a tick. | | |
| 3.8 | On success. | Shows Device ID (31728) and serial number, "ZIMRA test 31728 is connected", and a **Choose branches** link. The service lists the device (`GET /v1/devices`). | | |
| 3.9 | Click **Done**. | The device is in the table with a certificate chip showing days left. | | |
| 3.10 | Open the device with **Settings**. | Automatic open and close is switched **on** (new devices default to it). | | |
| 3.11 | Add another device using a **damaged** zip, or one that is not a ZIMRA certificate. | The stage that failed shows the real reason, **Try again** appears, nothing is stored in the service. | | |
| 3.12 | Click **Try again** after correcting the situation (or disconnecting the network to force the last stage to fail). | Resumes at the failed stage and does not create a second device. | | |
| 3.13 | Look for **I have an activation key** in step 2. | Not offered with the fiscal service (legacy only). Instead: add the **same zip again** under another name. Refused, naming the first device; the service still has one. | | |
| 3.14 | On the device row click **New certificate**, drop a new zip, **Install certificate**. | Shows "New certificate installed" with the new expiry date, then the connection check result. | | |
| 3.15 | Open **Add branch** again. | Step 2 now offers "Give it its own device" and lists the new device. Pick it and finish creating a branch. | | |
| 3.16 | POS settings, then the top panel **Which device does each branch use?** | The new branch shows the device you chose. | | |
| 3.17 | Add a second test device (for example 32160). | Added with no "address already used" message. Two devices are listed. | | |
| 3.18 | Look at the rows. | None says Central yet (unless `FISCAL_SERVICE_CENTRAL_DEVICE_ID` is set). Each offers **Make central**. A device with no certificate has it greyed out. | | |
| 3.19 | Click **Make central** on the first device and confirm. | "<name> is now the central device". A green **Central** chip appears on that row only. | | |
| 3.20 | Open **Fiscal day**, open the day on the central device, then click **Make central** on the other device. | Refused: the current central device still has a fiscal day open. The chip does not move. | | |
| 3.21 | Close that day (no sales waiting), then **Make central** on the other device. | Done. The Central chip moves. Shop invoices and branches without their own device now use it. | | |
| 3.22 | Stop fiscal-service and try to add a device. | Stops at the first stage with a plain message that the fiscal service could not be reached. Start the service and **Try again** works. | | |

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

### 6b. Sales from an earlier day, and closing the day

These need a test device and the cron (or call `/api/cron/pos-queue` and `/api/cron/fiscal-schedule` with the secret).

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 6.7 | Block ZIMRA (wrong device address), sell, then wait until the **next calendar day** (or set that sale's `soldDate` to an earlier day in the database for a faster test). Restore ZIMRA. | The queue fiscalises the sale by itself. It is **not** held for approval and nobody clicks anything. | | |
| 6.8 | Look at that sale in **POS sales**. | It keeps the original sale date. The ZIMRA receipt is dated when it was actually fiscalised. | | |
| 6.9 | Sales that were already held "for approval" before this change. | They are released on the next queue run and fiscalised. | | |
| 6.10 | Set a **late** close time (for example 23:00), block ZIMRA before it, and leave it blocked past midnight. Restore ZIMRA at about 09:00 the next morning. | The day closes within about 10 minutes of ZIMRA coming back, even though it is long after midnight. (The old behaviour gave up at midnight.) | | |
| 6.11 | With ZIMRA still blocked, watch the retries. | Every minute for the first 5 hours after the close time, then every 10 minutes. Each alert is sent once. | | |
| 6.12 | Cause a close that ZIMRA refuses for good (a receipt with a validation error). | Auto-retry stops for that day and an alert says an administrator must act. | | |
| 6.13 | Run `npx tsx scripts/test-close-schedule.ts`. | 10 checks pass. | | |
| 6.14 | Run `npx tsx scripts/pos-simulate.ts` against the test device (it now asserts the earlier-day behaviour). | Passes. It has **not** been run yet. | | |
| 6.15 | **Fiscal service backend:** open a day, sell, block ZIMRA, sell again (the sale waits), let the day pass 23 hours (or lower `recoverAfterHrs` for a quick test), restore ZIMRA. | Within a few minutes the waiting receipt is delivered, the old day is **closed** and a **new day opens by itself**. The till's waiting sales then go through. | | |
| 6.16 | Same, but ZIMRA refuses to close the old day (it is past its limit). | The event says to close it on the ZIMRA portal. Once it is closed there, a new day opens by itself. | | |
| 6.17 | Service with a late close time (23:00): leave a close failing past midnight. | It keeps trying the next morning and closes when ZIMRA answers. A day opened that morning is **not** closed by the old missed close. | | |
| 6.18 | Run `cd fiscal-service && npm test` (needs MongoDB and openssl). | All pass (140 at the time of writing), including the three-day outage scenario. | | |
| 6.19 | **Clock:** set the server clock about 2 minutes wrong, restart, make one ZIMRA call (for example open the Fiscal day page). | Within the next schedule tick an alert says the server clock is about 2 minutes behind or ahead of ZIMRA's. One alert per day. | | |
| 6.20 | With that clock wrong, set a close time a minute or two away. | The close happens at ZIMRA's time, not the server's wrong time. | | |
| 6.21 | Run `npx tsx scripts/test-clock-skew.ts`. | 10 checks pass. | | |

**What cannot be promised:** ZIMRA stops accepting receipts after the device's maximum day length (24 hours on test devices) and may need the day closed on its own portal. The system retries as long as it takes and alerts you, but it cannot override ZIMRA.

## 7. Roles and access

Roles: **Admin** (everything, fixed), **Branch manager** and **Cashier** (editable by a super admin). A super admin is an admin whose email is in `BOOTSTRAP_ADMIN_EMAILS` (any admin if that list is empty).

Use one browser per role: an admin, a branch manager (assigned to a branch) and a cashier.

### 7a. The Menu access screen

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.1 | As a **super admin** open the sidebar. | A **Menu access** entry is at the bottom. | | |
| 7.2 | As an admin who is **not** a super admin (only if `BOOTSTRAP_ADMIN_EMAILS` is set and excludes them). | No Menu access entry. Opening `/access` shows it read-only with a note. | | |
| 7.3 | Open **Menu access**. | Admin is shown as fixed. Below it a role switcher (Branch manager, Cashier) and a count such as "Can use N of M pages and actions". | | |
| 7.4 | With **Branch manager** selected, click **Sales focus**. | Dashboard and the point-of-sale pages stay on, the rest turn off. The preset button looks selected. The save bar slides up and the Branch manager tab shows an amber dot. | | |
| 7.5 | Switch to **Cashier** without saving, change something, switch back. | Both roles keep their unsaved changes. The save bar names both roles. | | |
| 7.6 | Click **Discard**. | Everything returns to the saved setup. | | |
| 7.7 | Click **Everything** on Branch manager, then **Save changes**. | Toast confirms. The list now includes Fiscal, Users, POS settings, and Settings. | | |
| 7.8 | On **Cashier** switch off **Open till**. | Warning appears: cashiers will not be able to sell. Switch it back on. | | |
| 7.9 | Look for Menu access, Exchange rates, Quotations, Invoices in the list. | None of them can be switched on. A note says they are admin-only. | | |

### 7b. Pages are refused, not just hidden

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.10 | Give Branch manager **Standard** and save. As the branch manager, type `/fiscal-devices` in the address bar. | You are sent to your dashboard. The page never shows. | | |
| 7.11 | As the branch manager, type `/pos-settings`, `/users`, `/branches`, `/settings`, `/access`. | Each sends you to the dashboard. | | |
| 7.12 | Hide **Stock products** from the branch manager and save. Wait up to a minute, then type `/products`. | Sent to the dashboard. (A page check can be up to a minute behind a change, because it reads the sign-in token. API calls are immediate.) | | |
| 7.13 | As the cashier, type `/dashboard`, `/products`, `/pos-sales`. | Each sends you to `/pos`. | | |
| 7.14 | As the cashier, type an API address such as `/api/analytics/time-series`. | Refused (403). | | |
| 7.15 | Shop pages (`/browse`, `/cart`) as a branch manager. | Still open. | | |

### 7c. Granting more than the preset

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.16 | Grant the branch manager **Fiscal day** only (on top of Standard) and save. | After a page reload the menu shows Fiscal day. The page opens and loads status. Fiscal devices and Central device stay refused. | | |
| 7.17 | Grant the branch manager **POS settings**. Open it. | They can change their **own** branch's settings. | | |
| 7.18 | As that branch manager, try to change another branch's settings (use the browser network tab to send a PATCH to `/api/pos/branches/<other branch id>`). | Refused (403). | | |
| 7.19 | Same manager: try bulk device assignment including another branch. | Refused. | | |
| 7.20 | Grant a cashier **POS sales** and save. | The cashier can open POS sales for their own branch; the menu appears on the admin pages. | | |
| 7.21 | Set the cashier back to **Standard** (Open till only). | Back to the till only. | | |

### 7d. Delegated user management

Grant the branch manager **Users**.

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.22 | The manager opens **Users**. | Sees only people in their own branch, and no administrators. | | |
| 7.23 | The manager adds a **cashier** to their own branch. | Works. | | |
| 7.24 | The manager tries to add an **admin**. | Refused: only an administrator can make someone an administrator. | | |
| 7.25 | The manager tries to change **their own role** to admin. | Refused. | | |
| 7.26 | The manager tries to move a cashier to **another branch**. | Refused. | | |
| 7.27 | The manager tries to edit or delete an **admin**. | Refused. | | |
| 7.28 | **Important:** 7.24 to 7.27 only work in your working tree. The edits to `app/api/users/[id]/route.ts` and `lib/actions/user-admin.action.ts` were not committed because both files carry your other uncommitted work. Commit them together with that work before relying on these rules. | n/a | | |

### 7e. Roles stay safe

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.29 | Admin never loses anything, whatever is saved. | Admin can open every page. | | |
| 7.30 | Nobody but a super admin can save changes. | A normal admin gets a refusal if they send the save request. | | |
| 7.31 | Run `npx tsx scripts/test-permissions.ts`. | 12 checks pass. | | |
| 7.32 | Run `node scripts/check-api-guards.mjs`. | Passes. | | |

## 7f. Quick browser check of everything above

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.33 | Start the app (`npm run dev`), then `node scripts/verify-ui.cjs` (add `BASE_URL=...` if it is not on port 3000). | 29 checks pass for admin, branch manager and cashier. Screenshots are saved under `test-output/ui-verify`. | | |

## 7g. Central device and branch devices share one screen

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.34 | Open **Central device** in the menu. | Fiscal service: a short page explaining the central device is chosen on **Fiscal devices** with a button to go there. (Legacy: the same layout as a branch device, with the branches on the central device listed.) | | |
| 7.35 | On Fiscal devices open **Settings** for the Central device, change the open time and the weekdays, Save settings. | Saved; the page reloads with the new values. | | |
| 7.36 | Certificate section: choose **Folder of certificate files**, pick `certificates_<id>`, click **Check the files first**. | A report lists the files that will be used, anything missing, and warnings. Then **Upload certificate** stores it. | | |
| 7.37 | Open a branch device with **Settings**. | It has the same weekday buttons and the folder option. | | |

## 7h. Shop invoices and outages

| # | Step | Expected | P/F | Notes |
|---|---|---|---|---|
| 7.38 | Pay a shop quotation while ZIMRA is blocked. | The payment is recorded. The invoice exists, unfiscalised, with an attempt count and a reason. | | |
| 7.39 | Unblock ZIMRA, wait for the cron (`/api/cron/pos-queue`). | The invoice is fiscalised by itself. Its retry marks are cleared. | | |
| 7.40 | Create an invoice with no lines, or a bad HS code, and pay it. | It goes to review (no endless retrying) and an alert is sent. | | |
| 7.41 | Run `npx tsx scripts/test-shop-fiscal.ts`. | 33 checks pass. | | |
| 7.42 | Read `docs/FISCAL_OUTAGE_RECOVERY.md` and run `cd fiscal-service && npx tsx scripts/recover-live.ts "<certs root>" <id> --yes` on a closed test device. | PASS (stale day closed, new day opened, receipt fiscalised, device left closed). | | |

## 8. Names and labels

| # | Where | Expected | P/F | Notes |
|---|---|---|---|---|
| 8.1 | Sidebar | Upload history, Upload stock, Stock products, Branch upload status, Fiscal day, Central device (opens a pointer to Fiscal devices with the fiscal service), Day-end reports. No "Downloads" heading. "Ask AI" sits under Insights. | | |
| 8.2 | Each page heading | Matches its menu entry (Upload history, Branch upload status, Fiscal day, Day-end reports (Z-reports), Central device settings). | | |
| 8.3 | **Stock products** | Card reads "Out of stock" with "Products with no units left". Filter tab and badge read "Out of stock". | | |
| 8.4 | Hover the filter tabs | Each shows its rule (Low Stock: fewer than 10 units, High Value: top 25%, Inactive: marked inactive). | | |
| 8.5 | **Branch Analytics** and **Product sales trend** charts (menu entry was "Product Movement") | Subtitle explains that sales are estimated from the drop in stock between uploads and that restocking can hide sales. | | |
| 8.6 | **Central device** vs the Add branch wizard and the Central chip | The same term is used everywhere. Nobody calls it "shared device". | | |
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
| 10.4 | `npx tsx scripts/test-permissions.ts` | 12 checks pass. No device or database needed. | | |
| 10.5 | `npx tsx scripts/test-close-schedule.ts` | 10 checks pass. No device or database needed. | | |
| 10.6 | `npx tsx scripts/pos-simulate.ts` | Passes against a ZIMRA test device. Not run yet. | | |

## 11. Your decisions (answered) and what is still open

| # | Question | Answer |
|---|---|---|
| 11.1 | Cross-day sales | **Done.** Pushed to the fiscal day that is open when the system recovers. No approval. |
| 11.2 | Per-branch open and close times | **Kept with the device.** The device's schedule decides. The close now keeps retrying until it succeeds (section 6b). |
| 11.3 | Hidden pages opened by address | **Done.** The proxy refuses them (section 7b). |
| 11.4 | Full role-based access | **Done.** Any page or action can be granted to Branch manager or Cashier. Admin is fixed. A delegated user manager is limited to their own branch and cannot create or touch admins. |
| 11.5 | One door to the fiscal layer, shop invoices queued, central device on the shared screen | **Done** (sections 7g and 7h). Still open: shop credit notes through the service. |
| 11.6 | Did the wizards feel quicker than the old screens? What slowed you down? | |

## Not covered by this sheet

- The e-commerce shop and quotations (untouched on purpose).
- The `posSale.service.ts` and `constants/constants.ts` edits that were already in your working tree before this work.
- Renewing the ZIMRA device certificate that is still in git history.
