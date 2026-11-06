"""Test sections 16 to 23."""


def r(tid, role, steps, expected, tags=""):
    return (tid, role, steps, expected, tags)


SECTIONS = [
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "16", "title": "Shop invoices and checkout",
        "intro": [
            "The online shop browses and shows quotations as before. Checkout and payment are switched OFF unless NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED=true. A paid shop invoice goes through the same fiscal layer as the till: if ZIMRA or the device is unavailable the invoice is queued, retried by the cron, and visible; it is never lost.",
            "Role: a shop customer, and an admin for Admin > Invoices (/admin/invoices, which is not in the menu but opens for an admin).",
        ],
        "groups": [
            {"title": "16.1 Checkout switch", "rows": [
                r("SHOP-01", "Customer", "With NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED unset, browse the shop, add to the cart, open /checkout.", "Browsing and the cart work. Checkout shows a friendly 'coming soon' panel and cannot be completed.", "NEW"),
                r("SHOP-02", "Technical", "Without the flag POST /api/shop/quotations, /api/payments/ecocash/initiate and /api/payments/zimswitch/checkout.", "Each answers 'Checkout is temporarily unavailable. Please check back soon.' (503). Nothing is created.", "NEW TECH"),
                r("SHOP-03", "Customer", "Set NEXT_PUBLIC_SHOP_CHECKOUT_ENABLED=true, restart, and run checkout.", "A quotation is created for the signed-in customer and the payment pages work.", "NEW"),
            ]},
            {"title": "16.2 A paid shop invoice and the fiscal layer", "rows": [
                r("SHOP-04", "Customer, Admin", "Pay a shop quotation (EcoCash, ZimSwitch or admin cash confirmation) while ZIMRA is working.", "The payment is recorded, an invoice is created and fiscalised. Admin > Invoices shows it as fiscalised with its QR and verification code.", "NEW"),
                r("SHOP-05", "Customer, Admin", "Pay a quotation while ZIMRA is blocked.", "The payment is recorded. The invoice exists, unfiscalised, with an attempt count and a reason. The customer is not told anything is wrong.", "NEW"),
                r("SHOP-06", "Admin", "Unblock ZIMRA and wait for the cron (/api/cron/pos-queue).", "The invoice is fiscalised by itself. Its retry marks are cleared.", "NEW"),
                r("SHOP-07", "Technical", "Watch the retry times for an invoice that keeps failing.", "Attempts are spaced 1, 2, 5, 10 minutes, then every 30 minutes. Retries wait until the device is reachable with a day open.", "NEW TECH"),
                r("SHOP-08", "Admin", "Create an invoice with no lines or a bad HS code and pay it.", "It goes to review at once (it is not retried for ever) and an alert is sent.", "NEW EDGE"),
                r("SHOP-09", "Admin", "Try to make a credit note or debit note for a shop invoice (receipt type CreditNote).", "Refused: 'A credit note cannot be issued from the shop: it does not say which invoice it corrects. Issue it from the till instead.' Nothing is sent to ZIMRA.", "NEW EDGE"),
                r("SHOP-10", "Admin", "Fiscalise a queued or review invoice by hand (Admin > Invoices).", "On success its retry and review marks clear and it shows as fiscalised.", "NEW"),
                r("SHOP-11", "Admin", "Generate a draft invoice by hand and leave it.", "The queue never touches it: only invoices handed over by the payment flow are retried.", "NEW"),
                r("SHOP-12", "Technical", "Set FISCAL_BACKEND=service and pay a shop quotation.", "The invoice is fiscalised through the service on the central device (FISCAL_SERVICE_CENTRAL_DEVICE_ID) and shows that device's number.", "NEW TECH OPTIONAL"),
                r("SHOP-13", "Admin", "On the central device's Fiscal day page compare the pre-close preview with the sales.", "Shop invoices are counted with the central device's totals, so the preview matches.", "NEW TECH"),
                r("SHOP-14", "Technical", "Run npx tsx scripts/test-shop-fiscal.ts.", "All checks pass (mapping, classification, retry timing, queue, refusal of credit notes).", "NEW TECH"),
            ]},
        ],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "17", "title": "Stock and analytics",
        "intro": ["Role: Admin or Branch manager. Stock uploads feed the dashboard, analytics and stock lists."],
        "groups": [{"rows": [
            r("STK-01", "Branch manager", "Upload stock > choose a branch and a stock file (test-data/week*.txt) > submit.", "The upload succeeds. Totals and counts are reported. A repeat of the same file is recognised as a duplicate.", ""),
            r("STK-02", "Branch manager", "Open Upload history.", "Every upload is listed with date, branch and totals. The page and the menu say 'Upload history'.", "CHANGED"),
            r("STK-03", "Branch manager", "Open an upload from the list.", "Upload details shows its products and quantities.", ""),
            r("STK-04", "Admin", "Open the Dashboard.", "Four cards: Products in stock, Stock value, Estimated sales (all time), Branches. Each has a line saying where the number comes from ('From each branch's latest upload', 'From stock drops between uploads').", "NEW CHANGED"),
            r("STK-05", "Admin", "Open Stock products.", "Cards: Total Products, Total Units in Stock, Total Stock Value and 'Out of stock' ('Products with no units left').", "CHANGED"),
            r("STK-06", "Admin", "Use the filter tabs and hover each.", "Tabs: All Products, In Stock, Out of stock, High Value, Low Stock, Inactive. Hover shows the rule (Low stock: fewer than 10 units; High value: top 25% by price; Inactive: marked inactive in the product list).", "NEW CHANGED"),
            r("STK-07", "Admin", "Look at a product with zero units.", "Its badge reads 'Out of stock' (it used to say 'Dead stock', which meant something else).", "CHANGED"),
            r("STK-08", "Admin", "Open Branch analytics. Change the metric to Estimated Sales, Units Sold and Stock Value.", "The chart's subtitle explains the metric in plain words, including that estimated sales come from the drop in stock between uploads times price and that restocking between uploads can hide sales.", "NEW"),
            r("STK-09", "Admin", "Open Product sales trend (was Product Movement) and search a product.", "A sales trend by branch for that product, with the same plain-words subtitle. The menu icon is a chart, not a warning triangle.", "CHANGED"),
            r("STK-10", "Admin", "Open Branch upload status.", "Each branch's last upload date and days since. The page title matches the menu.", "CHANGED"),
            r("STK-11", "Branch manager", "Open Ask AI under Insights.", "A chat about stock. A question about a product returns an answer based on the uploaded data.", ""),
            r("STK-12", "Branch manager", "Look at the dashboard as a branch manager of one branch.", "The numbers cover that branch only.", ""),
            r("STK-13", "Admin", "Check that every figure here matches the uploaded data for one branch (add up one week by hand).", "Stock value and units agree.", "EDGE"),
            r("STK-14", "Signed out", "Open /api/upload?storeId=<any id> and /api/products/export?startDate=2026-01-01&endDate=2026-12-31.", "Refused. No data.", "NEW TECH"),
        ]}],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "18", "title": "Navigation and names",
        "intro": ["Role: Admin. Look at the sidebar and at each page title."],
        "groups": [{"rows": [
            r("NAV-01", "Admin", "Read the sidebar.", "Dashboard; Uploads (Upload history, Upload stock); Insights (Branch Analytics, Product sales trend, Stock products, Branch upload status, Ask AI); Point of sale (Open till, POS sales, POS products, POS customers, POS settings); Fiscal (Fiscal day, Central device, Fiscal devices, Day-end reports); Team (Users, Branches); Menu access for a super admin.", "CHANGED"),
            r("NAV-02", "Admin", "Check there is no 'Downloads' heading and Ask AI sits under Insights.", "Correct.", "CHANGED"),
            r("NAV-03", "Admin", "Open each page and compare its heading with its menu name.", "They match: Upload history, Branch upload status, Fiscal day, Day-end reports (Z-reports), Central device settings, Exchange rates.", "CHANGED"),
            r("NAV-04", "Anyone", "Open /dashboard-2 and /archived-reports.", "Both are gone (404).", "CHANGED"),
            r("NAV-05", "Branch manager", "Read the sidebar with the default setup.", "No Fiscal or Team sections and no empty headings.", "NEW"),
            r("NAV-06", "Admin", "Use the menu to open every entry once.", "Every page loads without an error.", ""),
            r("NAV-07", "Admin", "Open the Branches page.", "One Add branch button, a table, no stray text, no debug output in the browser console.", "CHANGED"),
            r("NAV-08", "Admin", "Check the terms used.", "Everywhere the shared device is called 'Central device', and a till's fiscal state is described in plain words.", "CHANGED"),
        ]}],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "19", "title": "Security and concurrency",
        "intro": ["Technical tests run from the browser console or a terminal."],
        "groups": [
            {"title": "19.1 Carried forward from v1", "rows": [
                r("SEC-01", "Cashier", "As the Harare cashier run fetch('/api/pos/sales?branchId=<Cranborne id>').then(r => r.status).", "403. No Cranborne data.", "TECH"),
                r("SEC-02", "Cashier", "Run fetch('/api/pos/branches/<id>', {method:'PATCH', body: JSON.stringify({invoicePrefix:'ZZ'}), headers:{'Content-Type':'application/json'}}).", "Refused. Nothing changes.", "TECH"),
                r("SEC-03", "Cashier", "Look for any way to edit prices on the till.", "There is none.", ""),
                r("SEC-04", "Technical", "Run npm run pos:simulate (needs a working legacy device).", "The server recalculates totals itself; a tampered client total is ignored. Blocked while the Axis licence is pending.", "OPTIONAL TECH"),
                r("SEC-05", "Technical", "Run the browser tests (npx playwright test) if the test environment is set up.", "They pass (the till tests need a working device).", "OPTIONAL TECH"),
                r("SEC-06", "Technical", "Open /api/cron/pos-queue and /api/cron/fiscal-schedule with no secret, then a wrong one.", "401 or 503. They do nothing.", "TECH"),
                r("SEC-07", "Cashier", "Use customer name <img src=x onerror=alert(1)> and sell.", "It prints and displays as text. No script runs.", "EDGE"),
                r("SEC-08", "Admin, Cashier", "While a cashier is on the till an admin switches that branch's POS off. The cashier presses F12.", "The sale is refused with a clear message or saved offline safely. No crash.", "EDGE"),
                r("SEC-09", "Admin, Cashier", "While a cashier is signed in an admin deletes them. The cashier presses F12.", "The cashier is signed out; nothing breaks.", "EDGE"),
                r("SEC-10", "Cashier", "As a cashier open /api/admin/fiscal-settings.", "Refused. No certificate or secret is ever returned to a browser.", "TECH"),
                r("SEC-11", "Branch manager", "As supervisor@harare.test try to read or change another branch's data through the API.", "Refused (403).", "TECH"),
            ]},
            {"title": "19.2 New in v2.0", "rows": [
                r("SEC-12", "Signed out", "Request each of /api/accounts, /api/accounts/<id>, /api/users/email (POST), /api/seed/roles (POST), /api/products/export?..., /api/upload?storeId=....", "Every one is refused: no user or data comes back.", "NEW TECH"),
                r("SEC-13", "Technical", "Run npm run check:guards.", "'All non-public API routes have an auth check.' Adding a new unguarded route makes it fail.", "NEW TECH"),
                r("SEC-14", "Branch manager", "Call /api/products/export/branch?branchId=<a branch of ANOTHER store>&startDate=2026-01-01&endDate=2026-12-31.", "403.", "NEW TECH"),
                r("SEC-15", "Technical", "Open the sign-in page, disable JavaScript, submit the form.", "The credentials never appear in the address bar or the server log.", "NEW TECH"),
                r("SEC-16", "Technical", "Check what leaves the server: open the Network tab on Fiscal devices and Central device.", "No private key, PFX, password or activation key is ever in a response.", "NEW TECH"),
                r("SEC-17", "Super admin", "Try to give Branch manager Menu access, Exchange rates, Quotations, Invoices or the shop homepage settings.", "Not possible: those are admin only.", "NEW"),
                r("SEC-18", "Technical", "Run npm run verify:ui (app running).", "29 checks pass for admin, branch manager and cashier; screenshots are saved.", "NEW TECH"),
                r("SEC-19", "Technical", "Make two tills sell at the same moment on one device (SALE-33 with a stopwatch).", "No duplicate invoice numbers, no gaps, no repeated receipts at the device.", "NEW EDGE"),
            ]},
        ],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "20", "title": "Emailing invoices",
        "intro": ["The email rows need a mail server. Use the test SMTP sink or ask an engineer for working SMTP settings."],
        "groups": [{"rows": [
            r("EML-01", "Cashier, Admin", "In POS sales or F8 choose a fiscalised sale and click the envelope. Enter a valid address.", "A dialog offers A4 invoice (the default) and Slip. The email arrives with the invoice in the body and the verification QR as an inline image.", "OPTIONAL CHANGED"),
            r("EML-02", "Cashier", "Try 'abc', an empty address and a very long address.", "Refused with a message.", "EDGE"),
            r("EML-03", "Cashier", "Ask an engineer to give a wrong SMTP password, then send.", "A clear 'could not send' message. The sale is unaffected.", "OPTIONAL"),
            r("EML-04", "Cashier", "Email a saved (not yet fiscalised) sale.", "It is queued and sent automatically once the invoice is final.", "OPTIONAL CHANGED"),
            r("EML-05", "Customer", "Open the email in Gmail or Outlook.", "The QR code shows (it is an attachment shown inline, not a blocked image).", "OPTIONAL NEW"),
        ]}],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "21", "title": "Printing the receipt to PDF",
        "intro": [
            "Set up: in the browser print dialog choose Save as PDF as the default printer, paper width 80 mm if available, margins none, background graphics on. Sell one item.",
        ],
        "groups": [{"rows": [
            r("PRN-01", "Cashier", "Follow the set-up and press F12.", "The slip prints through the PDF printer without a dialog problem."),
            r("PRN-02", "Cashier", "Open the saved PDF.", "It contains only the slip."),
            r("PRN-03", "Cashier", "Look at the slip at 100%.", "80 mm wide.", "EDGE"),
            r("PRN-04", "Cashier", "Check the left and right edges and the QR.", "Nothing is clipped."),
            r("PRN-05", "Cashier", "View at 100% and at print preview scale.", "Legible."),
            r("PRN-06", "Cashier", "Sell 30 lines and save the PDF.", "The slip is complete across pages.", "EDGE"),
            r("PRN-07", "Cashier", "Show the PDF full screen and scan its QR with a phone.", "It opens the ZIMRA verification page."),
            r("PRN-08", "Cashier, Admin", "Save PDFs of a fiscal slip, a ZWG slip, a saved-invoice slip, a credit note slip, the test slip and an A4 invoice.", "Each prints correctly and is marked for what it is."),
            r("PRN-09", "Tester", "When a real 80 mm thermal printer is installed: Admin > print the test slip and a real sale.", "Prints the same as the PDF.", "OPTIONAL"),
        ]}],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "22", "title": "Automated and live checks",
        "intro": [
            "Run these from a terminal in the project folder. Rows 1 to 12 need MongoDB (and openssl for the fiscal service suite). Record the result line you see. All the npm shortcuts exist in package.json.",
            "Before running anything that touches a real ZIMRA test device, read docs/REHEARSAL_RUNBOOK.md section 2 and probe the device read-only first.",
        ],
        "groups": [{"rows": [
            r("AUTO-01", "Technical", "npx tsc --noEmit", "No errors (the whole project type-checks).", "NEW TECH"),
            r("AUTO-02", "Technical", "npm run check:guards", "'All non-public API routes have an auth check.'", "NEW TECH"),
            r("AUTO-03", "Technical", "npm run test:permissions", "12 checks pass.", "NEW TECH"),
            r("AUTO-04", "Technical", "npm run test:close-schedule  and  npm run test:clock-skew", "10 checks pass each.", "NEW TECH"),
            r("AUTO-05", "Technical", "npm run test:shop-fiscal", "All checks pass.", "NEW TECH"),
            r("AUTO-06", "Technical", "cd fiscal-service && npm test", "140 tests pass (needs MongoDB and openssl). Includes a three-day outage recovery scenario.", "NEW TECH"),
            r("AUTO-07", "Technical", "npm run test:service-backend", "'All checks passed'. Covers the app through the service: a sale, a credit note, ZIMRA down, the service down, an earlier-day sale, a shop invoice through an outage, many tills at once, and the day close.", "NEW TECH"),
            r("AUTO-08", "Technical", "npm run test:day-status, test:close-guard, test:tills, test:fiscal-alerts, test:vat", "Each passes (exit code 0, no FAIL lines).", "TECH"),
            r("AUTO-09", "Technical", "npm run test:despatch-lines, test:despatch-pairing, test:despatch-import, test:a4-pdf, test:despatch-sale, test:receipt-evidence", "Each passes. Record any that need extra setup.", "TECH OPTIONAL"),
            r("AUTO-10", "Technical", "With the app running: npm run verify:ui  (BASE_URL=http://localhost:3100 npm run verify:ui if not on port 3000)", "29 checks pass for admin, branch manager and cashier. Screenshots go to test-output/ui-verify.", "NEW TECH"),
            r("AUTO-11", "Technical", "Probe a device read-only: cd fiscal-service && npx tsx scripts/e2e-live.ts \"<certs root>\" <deviceId>", "Prints the device's state. A device must show FiscalDayClosed to be used by the checks below.", "NEW TECH"),
            r("AUTO-12", "Technical", "Live recovery on a closed, clean TEST device: npx tsx scripts/recover-live.ts \"<certs root>\" <deviceId> --yes", "'RESULT: PASS': a day was made stale, closed, a new day opened, a receipt fiscalised in it, and the device left closed.", "NEW TECH"),
            r("AUTO-13", "Technical", "npx playwright test tests/e2e/pos.spec.ts tests/e2e/pos-supervisor.spec.ts", "Pass only when the legacy device works. They expect 'Invoice issued', 'Invoice saved. The final copy follows automatically' and the row badge 'Issued'. Mark N/A while the Axis licence is pending.", "OPTIONAL TECH CHANGED"),
            r("AUTO-14", "Technical", "npm run pos:simulate", "Needs the legacy Axis device with a working licence. Mark N/A while 'License Status: pending'.", "OPTIONAL TECH"),
        ]}],
    },
    # ------------------------------------------------------------------------------------------------------------
    {
        "num": "23", "title": "Go-live rehearsal on real ZIMRA test devices",
        "intro": [
            "The rehearsal runs the real app code through the real fiscal service into real ZIMRA test devices, with a switchable fault layer that stands in for 'ZIMRA is down'. It sells, credits, rides out an outage, reconnects offline tills, restarts the service mid-queue, and closes every device, then checks the Z-reports against the sales.",
            "The full step-by-step instructions, safety rules and troubleshooting are in docs/REHEARSAL_RUNBOOK.md. It is written so it can be pasted into a Claude chat that has access to this repository. The rows below are the acceptance criteria.",
        ],
        "groups": [{"rows": [
            r("REH-01", "Technical", "Check the machine: at least 5 GB free disk and plenty of free memory; close other heavy programs.", "A rehearsal run killed by low memory leaves devices open (and any RED receipt means a portal close).", "NEW TECH"),
            r("REH-02", "Technical", "Probe every candidate device read-only (AUTO-11). Choose devices that show FiscalDayClosed and have a valid certificate.", "At least three usable devices are found. Devices with an open day, a CloseFailed state or a revoked certificate are NOT used.", "NEW TECH"),
            r("REH-03", "Technical", "Assemble a certificates folder with one certificates_<id> folder (cert.crt, key.key) per chosen device. For a renewed device use its renewed pair.", "The folder path is ready. It is outside the repository or ignored by git.", "NEW TECH"),
            r("REH-04", "Technical", "Run the read-only check: npm run acceptance -- --certs=<folder> --scenario=fiscal-service/scenarios/acceptance-closed-devices.json  (edit the device ids in a copy of the scenario).", "Every device is reported usable. Nothing is sent.", "NEW TECH"),
            r("REH-05", "Technical", "Run it for real with --yes. It takes several minutes: do not stop it.", "It prints steps S1 to S7 with PASS lines and writes test-evidence/acceptance-<time>/summary.md.", "NEW TECH"),
            r("REH-06", "Technical", "Read summary.md. S1: normal trading on shared and own devices, USD and ZWG, tax inclusive and exclusive.", "Every sale is fiscalised.", "NEW TECH"),
            r("REH-07", "Technical", "S2 credit notes. S3 ZIMRA unreachable. S4 offline tills reconnect during the outage.", "Credit notes are fiscalised. During the outage every sale completes with a saved slip and nothing is lost. Offline tills deliver their sales.", "NEW TECH"),
            r("REH-08", "Technical", "S5 ZIMRA returns. S6 the service restarts mid-queue.", "Everything is fiscalised exactly once, in order, with QR codes ZIMRA knows. The service resumes after the restart without duplicates.", "NEW TECH"),
            r("REH-09", "Technical", "S7 the close. Check each device afterwards with AUTO-11.", "Every device closes cleanly, the Z-report equals the sales, and every device is left FiscalDayClosed.", "NEW TECH"),
            r("REH-10", "Technical", "If a receipt came back RED (for example RCPT013).", "STOP. Do not rerun on that device. Close its day on the ZIMRA portal and read the troubleshooting table in docs/REHEARSAL_RUNBOOK.md.", "NEW TECH EDGE"),
            r("REH-11", "Business owner", "Review the PDFs and QR lookups saved in the evidence folder.", "Every slip and A4 invoice looks right and every QR resolves at ZIMRA.", "NEW"),
        ]}],
    },
]
