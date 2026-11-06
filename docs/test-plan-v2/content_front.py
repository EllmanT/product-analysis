"""Front matter and appendices of the v2.0 test plan."""

TITLE = "StockFlow Test Plan"
SUBTITLE = "Version 2.0: stock, point of sale, fiscalisation, shop and access control"

TITLE_FACTS = [
    ["Version", "2.0. Replaces the POS Test Checklist (v1, 7 October 2026). Every v1 test is carried forward, reworded where behaviour changed."],
    ["Date", "6 November 2026"],
    ["System", "StockFlow: stock upload and analytics, a multi-branch fiscal point of sale, an online shop, and ZIMRA fiscalisation through a separate fiscal service."],
    ["Built against", "Branch master, commit a5aba69 and later. If you test a later build, note its commit in the defect log."],
    ["Who it is for", "Functional testers (everything not marked TECH), administrators checking their own setup, and technical testers (rows marked TECH need a terminal or the browser console)."],
    ["Related documents", "docs/AGENT_HANDOFF.md (for a new engineer or AI agent), docs/REHEARSAL_RUNBOOK.md (the go-live rehearsal on real ZIMRA test devices), docs/FISCAL_OUTAGE_RECOVERY.md, docs/FISCAL_RUNBOOK.md, docs/MODULES.md."],
]
TITLE_NOTE = "Test environment only. Never run these tests against a production database or a live ZIMRA device."


def contents(sections):
    items = [("0", "Before you start")]
    items += [(s["num"], s["title"]) for s in sections]
    items += [("A", "Test accounts and data"), ("B", "What a correct fiscal slip looks like"), ("C", "Glossary"), ("D", "Results summary"), ("E", "Defect log"), ("F", "Sign-off")]
    return items


# (heading, level, kind, body)   kind: p | bullets | table | key
FRONT = [
    ("0. Before you start", 1, "p", [
        "This plan tests the whole system as people use it: signing in, setting up branches, devices and staff, selling at the till, what happens when ZIMRA or the network fails, the shop, stock reports, security, and the automated and live checks behind them.",
        "Each test is one row. Do the steps, compare with the expected result, tick Pass or Fail, and write anything odd in Notes. Log every failure in the defect log (Appendix E) with the test ID.",
    ]),
    ("0.1 How to use this plan", 2, "bullets", [
        "Work through the sections in order the first time: later sections reuse data created in earlier ones (a branch, a device, a till, some sales).",
        "Rows tagged NEW did not exist in v1. Rows tagged CHANGED behave differently from v1: re-test them even if you passed the v1 version.",
        "Rows tagged EDGE are unusual inputs that should be handled gracefully, never crash, and never lose a sale.",
        "Rows tagged OPTIONAL need something extra (a mail server, a thermal printer, a scheduler). Mark N/A if you do not have it.",
        "Rows tagged TECH need a terminal or the browser console. Give them to a technical tester.",
        "A sale must never be lost. If any test makes a sale disappear, stop and report it as Critical straight away.",
        "Take a screenshot for every Fail and name it with the test ID (for example SALE-14.png).",
    ]),
    ("0.2 Result key and tags", 2, "key", [
        ["Pass", "The result matched the expected result exactly."],
        ["Fail", "Anything different, including a wrong message, a missing screen or an error. Write what you saw."],
        ["N/A", "The test does not apply to your setup (give the reason in Notes)."],
        ["NEW", "A test added in v2.0 for a feature that did not exist in v1."],
        ["CHANGED", "A v1 test whose steps or expected result changed. Re-test it."],
        ["EDGE", "An unusual or hostile input."],
        ["OPTIONAL", "Needs extra equipment or configuration."],
        ["TECH", "Needs a terminal or the browser console."],
        ["Severity", "Critical: a sale lost, wrong tax, a wrong person sees data, a security hole. High: a main flow is blocked. Medium: a flow works but wrongly. Low: wording or layout."],
    ]),
    ("0.3 Test levels", 2, "table", (
        ["Level", "Time", "What to run"],
        [
            ["Smoke", "About 45 minutes", "AUTH-01, AUTH-03, AUTH-16, ACC-12, BRN-11, DEV-18, TILL-02, SALE-02, SALE-16, SLIP-06, FAIL-01 to FAIL-04, CN-02, RPT-01, NAV-01, AUTO-01 to AUTO-04. Run after every deployment."],
            ["Standard", "One to two days", "Every row except OPTIONAL and TECH rows that need live ZIMRA devices. Run before each release."],
            ["Deep", "Several days", "Everything, including TECH rows, the live-device checks (section 22) and the go-live rehearsal (section 23). Run before go-live or after any change to fiscal code."],
        ],
        [30, 40, 197],
    )),
    ("0.4 Start the system", 2, "bullets", [
        "Install: npm install. Copy .env.local (database, secrets) and .env.test (test accounts). Ask an engineer for both; never commit them.",
        "Database: MongoDB must be running. On a Windows machine where the MongoDB service will not start, run mongod from a normal terminal: mongod --dbpath <folder> --setParameter diagnosticDataCollectionEnabled=false.",
        "Disk and memory: keep at least 5 GB of disk free (MongoDB refuses to write below 500 MB) and close heavy programs. Two test runs were killed by low memory while this plan was written.",
        "Start the app: npm run dev. It listens on port 3000. If another program already uses port 3000, run npx next dev -p 3100 and use that address everywhere below.",
        "Seed the test accounts if the database is empty: npm run seed:test, then npx tsx scripts/pos-seed-test-accounts.ts, then npm run pos:demo.",
        "Scheduler (OPTIONAL): set CRON_SECRET in .env.local and call /api/cron/pos-queue and /api/cron/fiscal-schedule every minute with the header Authorization: Bearer <CRON_SECRET>. Without it nothing retries by itself.",
        "Fiscal back end: FISCAL_BACKEND=legacy (default) talks to an Axis Virtual Device; FISCAL_BACKEND=service talks to the separate fiscal service, which talks to ZIMRA directly. See the AUTO and REH sections for how each is tested.",
        "Super admin: set BOOTSTRAP_ADMIN_EMAILS to the email of the administrator who will edit Menu access. If it is empty, every administrator counts as a super admin.",
    ]),
    ("0.5 Roles", 2, "table", (
        ["Role", "What they can do by default"],
        [
            ["Admin", "Everything. Fixed: it cannot be edited, so nobody can lock themselves out."],
            ["Super admin", "An admin whose email is in BOOTSTRAP_ADMIN_EMAILS. The only person who can change what Branch manager and Cashier may open and do (Menu access)."],
            ["Branch manager", "(Stored as branch_user.) Runs one branch: dashboard, uploads, reports, stock, and the point of sale pages for their own branch. Default pages are listed in section 4. A super admin can widen or narrow this."],
            ["Cashier", "Works at the till of their own branch only. A super admin can grant more."],
        ],
        [40, 227],
    )),
    ("0.6 Devices", 2, "bullets", [
        "A fiscal device is what reports each sale to ZIMRA. The central device is shared by every branch that has no device of its own. A branch can have its own device.",
        "ZIMRA gives each device a maximum fiscal day length (usually 24 hours). Past it, ZIMRA stops taking receipts until the day is closed.",
        "A receipt ZIMRA flags RED cannot be taken back, and the fiscal day then cannot be closed by the system. Close that day on the ZIMRA portal. Never send test receipts you cannot afford to lose to a device with a shared history.",
        "The Axis Virtual Device at 140.82.25.196:10005 answered 'License Status: pending' on 6 November 2026, so every sale on it is saved as an invoice that cannot be fiscalised until its licence is renewed. Use the direct ZIMRA test devices (section 22 and 23) instead.",
        "Always check a device's state before using it (npx tsx fiscal-service/scripts/e2e-live.ts without --yes is read only). A device must be FiscalDayClosed and clean to be used by the rehearsal.",
    ]),
    ("0.7 What is new since v1", 2, "table", (
        ["Area", "What changed", "Sections"],
        [
            ["Access", "Menu access: a super admin chooses what Branch manager and Cashier may open and do. Pages a role was not given are refused even if typed in the address bar. APIs check the same permissions. Delegated user managers are limited to their own branch.", "3, 4, 19"],
            ["Setup", "Add branch is a four step wizard. Add device is a guided three step flow with live progress and retry. The central device and branch devices share one settings screen. Till on/off has one control and one status.", "5, 6, 7"],
            ["Cashier screen", "Plain invoice wording ('Issue invoice & print', 'Invoice saved'). Fiscal device and day status, retry buttons and 'awaiting fiscalisation' are shown to administrators only.", "9, 11"],
            ["Fiscal day", "Opens by itself when sales are waiting, closes until it succeeds (even after midnight), a stale day is closed and replaced, ZIMRA's clock is followed, sales from an earlier day are fiscalised automatically.", "15"],
            ["Shop", "A paid shop invoice is never lost to an outage: it is queued, retried and visible. Shop credit notes are refused. Checkout can be switched off.", "16"],
            ["Labels", "Out of stock (was Dead stock), dashboard cards say where each number comes from, chart help text, new menu names.", "17, 18"],
            ["Security", "Open API routes were closed. The sign-in form never puts the password in the address. The browser verification script covers admin, branch manager and cashier.", "19, 22"],
            ["Tests", "Automated suites, a live recovery check and a go-live rehearsal on real ZIMRA test devices.", "22, 23"],
        ],
        [28, 200, 39],
    )),
    ("0.8 Known limitations and observations", 2, "bullets", [
        "ZIMRA may refuse to close a day that is past its maximum length. The system retries as long as it takes and alerts, but the day may need closing on the ZIMRA portal.",
        "Hiding a page is enforced when a person's browser next refreshes its session, which can be a short while after the change. API checks are immediate.",
        "Shop credit and debit notes are not supported: the shop cannot record which invoice a note corrects. Credit notes are issued at the till.",
        "A till shows 'Server unreachable: selling offline' if the first request after a fresh start is very slow (it gives up after 8 seconds). It clears itself. Sales are never lost.",
        "The Axis Virtual Device licence is pending (see 0.6).",
        "The test mail server (SMTP sink) is needed for the email rows; without it mark them N/A.",
        "The shop home page is the shop, not the sign-in page: open /sign-in directly.",
    ]),
    ("0.9 Safety rules for testers", 2, "bullets", [
        "Test environment only. Check the address of the database and the device before you start.",
        "Do not delete or edit data you did not create, except the test data listed in Appendix A.",
        "Do not run the live-device checks on a device somebody else is using. Ask first.",
        "Never paste real certificates, passwords or activation keys into a chat, a ticket or a document.",
        "If a RED receipt appears on a device, stop using that device and tell an engineer: that day must be closed on the ZIMRA portal.",
        "If the machine is low on disk or memory, stop. A killed test run can leave a device's fiscal day open.",
    ]),
]

APPENDICES = [
    ("Appendix A. Test accounts and data", "table", (
        ["Who", "Email", "Password", "Role / branch"],
        [
            ["Administrator", "admin@testbranch.com", "Admin@123456", "Admin, all branches (a super admin only if listed in BOOTSTRAP_ADMIN_EMAILS)"],
            ["Branch manager (original)", "branch@testbranch.com", "Branch@123456", "Branch manager, Test Branch"],
            ["Cashier, Harare Street", "cashier@harare.test", "Cashier@123456", "Cashier, Harare Street (prefix H)"],
            ["Cashier, Cranborne", "cashier2@cranborne.test", "Cashier@123456", "Cashier, Cranborne (prefix C)"],
            ["Cashier, POS switched off", "cashier3@bulawayo.test", "Cashier@123456", "Cashier, Bulawayo (POS off)"],
            ["Supervisor, Harare Street", "supervisor@harare.test", "Supervisor@123456", "Branch manager, Harare Street"],
            ["Supervisor, Cranborne", "supervisor2@cranborne.test", "Supervisor@123456", "Branch manager, Cranborne"],
            ["No password set", "nopassword@harare.test", "(none)", "Cashier, Harare Street"],
            ["Created during the tests", "newcashier@harare.test, newbranch@cranborne.test, newadmin@harare.test", "Newcash@123456, Newbranch@123456, Newadmin@123456", "Added by you in section 2"],
            ["Exchange rate", "1 USD = 26.50 ZWG", "", "Twin Socket has a fixed ZWG price of 115"],
            ["Harare products (USD)", "LED Bulb 9W 2.50 (LB9), LED Bulb 12W 3.20 (LB12), Extension Cord 5m 8.99 (EC5), Circuit Breaker 20A 6.75 (CB20), Twin Socket, Wall Switch 1.90, Cable 2.5mm per metre", "", "'Various' (VAR) and 'Wiring labour' (WIRE) are price-at-till items: the cashier types the price"],
            ["Cranborne products (USD)", "LED Bulb 9W 2.60, Padlock 40mm 5.50, Cable 2.5mm per metre 1.40, Various (price at till)", "", ""],
        ],
        [45, 85, 60, 77],
    )),
    ("Appendix B. What a correct fiscal slip looks like", "bullets", [
        "Width: an 80 mm thermal slip. Nothing is clipped at either edge and the QR code is complete.",
        "Header: business name, branch name, address, phone, email, TIN and VAT number as set in POS settings.",
        "Information block: invoice number (for example HU0001), date and time, cashier, till, customer if one was entered, currency.",
        "Items: description, quantity, price and line total for each line. Typed or special characters are printed as text, never interpreted.",
        "VAT summary: one row per tax rate with the amount taxed and the VAT. VAT is worked out once per tax rate on the total of that rate, so the VAT figure equals what ZIMRA records.",
        "Totals: total, payment method, and the amount in the other currency where relevant.",
        "Fiscal block: fiscal day number, receipt counter, global number, device ID and serial, verification code printed as XXXX-XXXX-XXXX-XXXX, and a QR code that opens ZIMRA's verification page for exactly this receipt.",
        "Footer: the footer lines from POS settings (at most six). A reprint is marked as a duplicate.",
        "A saved (not yet fiscalised) invoice prints with its own provisional number (for example HUP0001) and says a final tax invoice will follow. The cashier's screen says only 'Invoice saved'.",
    ]),
    ("Appendix C. Glossary", "table", (
        ["Term", "Meaning"],
        [
            ["Fiscal day", "A period ZIMRA counts as one day for a device. It must be opened before receipts and closed to report the day's totals."],
            ["Z-report (Day-end report)", "The totals ZIMRA receives when a fiscal day is closed. Called Day-end reports in the menu."],
            ["Fiscalise", "Send a sale to ZIMRA so it becomes a valid tax receipt with a verification code and QR."],
            ["Saved invoice", "A sale the system has kept and numbered but not yet been able to send to ZIMRA. It is sent by itself later. The cashier sees 'Invoice saved'."],
            ["Provisional number", "A temporary invoice number (for example HUP0001) used until the sale is fiscalised and receives its fiscal number."],
            ["Central device", "The fiscal device shared by every branch without its own."],
            ["RED receipt", "A receipt ZIMRA flagged as invalid. It cannot be undone and stops the day being closed by the system."],
            ["RCPT013", "ZIMRA's code for an invoice number that was already used on that device."],
            ["Stale day", "A fiscal day that has stayed open close to or past the device's maximum length."],
            ["Super admin", "An administrator listed in BOOTSTRAP_ADMIN_EMAILS who may change Menu access."],
            ["Permission", "A page (its menu address) or an action (for example voiding sales) that a role may use."],
            ["Delegated user manager", "A non-admin who was granted the Users page: limited to their own branch."],
        ],
        [55, 212],
    )),
    ("Appendix D. Results summary", "table", (
        ["Section", "Tests", "Pass", "Fail", "N/A", "Tester", "Date"],
        [[f"{n}. {t}", "", "", "", "", "", ""] for n, t in [
            ("1", "Login, access and roles"), ("2", "User management"), ("3", "Delegated user management"), ("4", "Roles and menu access"),
            ("5", "Add branch wizard"), ("6", "Fiscal devices"), ("7", "Tills"), ("8", "Admin set-up"), ("9", "The till: sales"),
            ("10", "The receipt"), ("11", "When ZIMRA or the device is unavailable"), ("12", "Offline selling"), ("13", "Credit notes and voids"),
            ("14", "Reports"), ("15", "Fiscal day automation and recovery"), ("16", "Shop invoices and checkout"), ("17", "Stock and analytics"),
            ("18", "Navigation and names"), ("19", "Security and concurrency"), ("20", "Emailing invoices"), ("21", "Printing"),
            ("22", "Automated and live checks"), ("23", "Go-live rehearsal"),
        ]],
        [75, 22, 22, 22, 22, 52, 52],
    )),
    ("Appendix E. Defect log", "table", (
        ["#", "Test ID", "Severity", "What happened", "Expected", "Screenshot / commit", "Status"],
        [["", "", "", "", "", "", ""] for _ in range(14)],
        [10, 25, 24, 82, 66, 40, 20],
    )),
    ("Appendix F. Sign-off", "table", (
        ["Role", "Name", "Signature", "Date", "Build / commit tested"],
        [["Lead tester", "", "", "", ""], ["Administrator", "", "", "", ""], ["Engineer", "", "", "", ""], ["Business owner", "", "", "", ""]],
        [45, 60, 62, 35, 65],
    )),
]
