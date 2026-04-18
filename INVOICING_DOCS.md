# INVOICING_DOCS — Fiscalization & E-Invoicing Codebase

**Source tree:** `ref-codebases/invoicing/`  
**Generated:** 2026-04-18  
**Purpose:** Technical reference to re-implement fiscalization (Zimbabwe / ZIMRA FDMS) and invoicing elsewhere (e.g. Next.js).

**Method note:** This document is based on a full recursive listing of every path under `ref-codebases/invoicing/` (472 files) and detailed review of all fiscalization, routing, model, migration, service, job, and Angular invoice UI code. Dependency lockfiles (`package-lock.json`, `composer.lock`) and binary assets were not line-reviewed; they appear in the file manifest with appropriate notes.

---

## Section 1 — Project Overview

### What the system does (high level)

This repository is an **e-invoicing / fiscalization product** branded as **E-Invoicing** (Axis Solutions). It lets companies:

1. **Register** with a **Fiscal Cloud** API (`api.fiscalcloud.co.zw`) and obtain a **virtual fiscal device**.
2. **Activate** the device via **Docs AI** (`register-company`), which returns **ZIMRA device id** and **activation key**, then **Fiscal Cloud** `activate` completes certificate/device setup.
3. **Create invoices** (fiscal invoice, credit note, debit note) in the **Angular** SPA, stored in **PostgreSQL** via a **Laravel 12** JSON API.
4. **Fiscalize** drafts by submitting receipt data to **ZIMRA’s Virtual Fiscal Device API** (FDMS test/production host). On success, the system stores **verification code**, **verification URL**, **QR-related URL**, **fiscal day number**, **FDMS invoice number**, etc., and marks the invoice `SUBMITTED`.
5. **Generate PDFs** (server: DomPDF + QR; client: jsPDF + `qrcode`) embedding fiscal verification and a **QR code** encoding the verification link or QR URL from ZIMRA.
6. **Operational extras:** fiscal day **open/close** (manual API + scheduled jobs), **FDMS production application** Excel generation and email with sample fiscalized PDFs.

### Is this ZIMRA-integrated? What does “fiscalized” mean here?

**Yes.** The backend explicitly targets **ZIMRA Fiscal Device Management System (FDMS)** via a **Virtual Fiscal Device** HTTP API (see `ZimraFiscalService` and comments referencing *VirtualFiscalDevice_MultiTenant_API_Guide.pdf*).

In **this codebase**, an invoice is treated as **fiscalized** when:

- `POST .../api/VirtualDevice/SubmitReceipt` returns HTTP success and top-level `Code === "1"` (string).
- The app sets `invoices.status` to **`SUBMITTED`** and `fiscal_submission_at` to the current time.
- A **`fiscal_responses`** row is created with (among others):
  - **`verification_code`** — human verification string from ZIMRA.
  - **`verification_link`** — URL for public/manual verification (used for QR in PDFs when present).
  - **`qr_code_url`** — alternate string from ZIMRA used if verification link is empty (payload field names vary; see Section 3).
  - **`fiscal_day_no`**, **`fdms_invoice_no`**, **`receipt_global_no`**, **`receipt_counter`**, **`receipt_id`**, **`device_id`** (local device UUID or fallback from response).
  - **`raw_response`** — full JSON for audit/debug.

**Legal validity in Zimbabwe** is **not fully specified in code** (no copy of the statute or FDMS checklist in-repo). The **frontend PDF service** comments mention an “FDMS checklist” for seller/customer fields on A4 templates. What the **code actually enforces** is: line items with HS codes, tax codes, totals consistent with ZIMRA’s validation rules, buyer/seller blocks on PDFs, and fiscal verification block + QR. **Exact legally mandatory fields** on the printed document should be confirmed against **current ZIMRA/FDMS published rules**; this doc describes **what the software sends and displays**, not a legal opinion.

### Tech stack

| Layer | Technology | Versions (from manifests) |
|--------|-------------|---------------------------|
| **Backend** | PHP, Laravel | PHP `^8.2`, Laravel `^12` |
| **Backend HTTP API auth** | Laravel Sanctum | `^4.3` |
| **Backend admin UI** | Inertia + React (Vite) | Inertia Laravel `^3.0`, React pages under `resources/js/Pages/Admin/` |
| **Backend PDF** | barryvdh/laravel-dompdf | `^3.1` |
| **Backend QR** | endroid/qr-code | `^6.1` |
| **Backend spreadsheets** | phpoffice/phpspreadsheet | `^5.6` (FDMS Excel template) |
| **Backend queues / ops** | Laravel Horizon, Redis predis | Horizon `^5.45`, predis `^3.4` |
| **Backend auditing / settings** | owen-it/laravel-auditing, spatie/laravel-settings/data | auditing `^14`, settings `^3.7`, data `^4.20` |
| **Database** | PostgreSQL (configured in `.env.example`) | — |
| **Frontend SPA** | Angular (standalone components), PrimeNG, Tailwind 4 | Angular `^21.2`, PrimeNG `^21.1`, RxJS `~7.8` |
| **Frontend PDF** | jsPDF | `^4.2` |
| **Frontend QR** | `qrcode` (Node) | `^1.5.4` |
| **Frontend SSR** | Angular SSR + Express | `@angular/ssr` `^21.2`, `express` `^5.1` |

### Folder structure (high level)

- `ref-codebases/invoicing/backend/` — Laravel app (API + admin Inertia + jobs + migrations).
- `ref-codebases/invoicing/frontend/` — Angular SPA (`src/app/...`).

### Entry points

| App | Entry / bootstrap |
|-----|-------------------|
| **Laravel HTTP** | `backend/public/index.php` → `bootstrap/app.php` |
| **Laravel routes** | `routes/api.php` (API), `routes/web.php` (minimal), `routes/admin.php` (Inertia admin, `web` middleware), `routes/console.php` |
| **Angular browser** | `frontend/src/main.ts` → `bootstrapApplication(App, appConfig)` |
| **Angular SSR** | `frontend/src/main.server.ts`, `frontend/src/server.ts` |

### How frontend and backend communicate

- **REST JSON over HTTP** from Angular `HttpClient` to `environment.apiUrl` (e.g. `http://127.0.0.1:8000`).
- **Authentication:** `Authorization: Bearer <sanctum token>` via `auth-token.interceptor.ts`.
- **No GraphQL / WebSockets** for invoicing in this tree.

### Configuration overview

- **Environment:** `backend/.env` (see `.env.example` and `scripts/environment.txt` for samples).
- **Runtime overrides:** After migrations, **`IntegrationSettings`** (Spatie) in the database **overwrites** `config()` for ZIMRA URL, Fiscal Cloud URL/key/timeout, Docs AI URL, Axis Billing, etc. (`AppServiceProvider::boot`).
- **Fiscal Cloud:** `config/fiscalcloud.php` + DB integration group.
- **ZIMRA URL:** `config/services.php` key `zimra.api_url` — overridden by `integration.zimra_api_url` when settings exist.
- **Hardcoded constants:** e.g. `ActivateFiscalCloudDeviceJob` uses `supplierId => '2000093077'` for Docs AI payload; `FiscalCompanyApplyController` dispatches activation with environment **`test`**.

---

## Section 2 — Database / Data Structure

Primary store: **PostgreSQL** (UUID primary keys on most domain tables). Below: **logical model** as implemented by migrations + Eloquent. Nullable/required follows DB constraints; application validation may be stricter.

### `companies`

**Business concept:** Tenant company (taxpayer) linked to Fiscal Cloud.

| Field | Type | Required | Meaning |
|-------|------|----------|--------|
| `id` | uuid | yes | Primary key |
| `fiscal_cloud_company_id` | string(100) | yes | ID from Fiscal Cloud |
| `legal_name`, `trade_name` | string | yes / nullable | Registered vs trading name |
| `tin`, `vat_number` | string | yes / nullable | Tax identifiers |
| `region`, `station`, `province`, `city`, `address_line`, `house_number` | string | nullable | Structured address (added by migration) |
| `address` | text | nullable | Legacy combined address |
| `phone`, `email` | string | nullable | Contact |
| `fiscal_cloud_payload` | json | nullable | Raw Fiscal Cloud registration response |
| `logo_url` | string | nullable | Branding |
| `axis_billing_team_id`, `axis_billing_customer_id` | int/bigint | nullable | Links to Axis Billing |
| `is_service_company`, `default_tax_inclusive`, `default_currency`, `is_active` | bool/string | defaults | Tenant defaults |

**Indexes/constraints:** `fiscal_cloud_company_id` unique; `tin` / `vat_number` indexed (initial migration).

**Relations:** Has many `company_devices`, `buyers`, `products`, etc.

**Note:** `Company` Eloquent `$fillable` in code may be **narrower** than DB columns for some attributes — mass assignment is controlled in controllers.

### `company_devices`

**Business concept:** Virtual fiscal device (Fiscal Cloud device + ZIMRA activation metadata).

Key fields (evolved across migrations): `company_id`, `fiscal_device_id` (unique), `device_serial_no`, `device_name`, `zimra_device_id`, `zimra_activation_key`, `zimra_environment`, `zimra_payload`, `fiscal_cloud_activated_at`, `fiscal_cloud_activation_payload`, `activation_status`, `activation_attempted_at`, `activation_error`, `zimra_fdms_template_emailed_at`, `zimra_fdms_invoices_generated_at`, `fiscal_day_status`, `fiscal_day_open_at`, `is_active`, `auto_open_close_day`, `fiscal_cloud_payload` (json).

**Relations:** Belongs to `companies`.

### `users`

Tenant users and super-admins: `company_id` nullable, `email` unique, `password`, `role` enum `SUPER_ADMIN|ADMIN|USER`, `is_active`, OAuth fields (migrations), etc.

### `personal_access_tokens`

Sanctum API tokens (`tokenable` polymorphic to `users`).

### `buyers`

Customers of a company: `register_name`, `trade_name`, `tin`, `vat_number`, address parts, `email`, `phone`, `is_active`.

**Important:** ZIMRA payload builder uses `$buyer->name` and `$buyer->address`, but the model stores **`register_name`** and structured address fields — see Section 9.

### `products`, `hs_codes`, `company_hs_codes`, `tax_rates`, `units_of_measure`

Catalog and tenant preferences for invoice lines (HS codes, VAT rates, UoM).

### `invoices`

**Business concept:** Fiscal document header.

| Field | Notes |
|-------|--------|
| `invoice_no` | Unique business document number |
| `receipt_type` | `FiscalInvoice`, `CreditNote`, `DebitNote` |
| `receipt_print_form` | `InvoiceA4`, `Receipt48` |
| `receipt_currency`, `receipt_date` | Money and timestamp |
| `tax_inclusive`, `receipt_total`, `total_excl_tax`, `total_vat` | Totals |
| `payment_method`, `payment_amount` | CASH/CARD/… |
| `ref_*` | Reference to original invoice for notes |
| `status` | `DRAFT` until fiscalized → `SUBMITTED` |
| `fiscal_submission_at` | Set on successful fiscalization |
| `buyer_snapshot`, `banking_details_snapshot` | JSON snapshots |
| `device_id` | Nullable (migration made optional) — links `company_devices` |

### `invoice_lines`

Line items: `line_no`, `line_type` (`Sale|Discount`), `hs_code`, `description`, `quantity`, `unit_price`, `tax_code` (`A|B|C`), `tax_percent`, `vat_amount`, `line_total_excl`, `line_total_incl`, `product_id`.

### `invoice_taxes`

Aggregated tax breakdown per invoice.

### `fiscal_responses`

One row per fiscalized invoice (`invoice_id` unique): stores ZIMRA return fields + `raw_response` json.

**Note:** Migration types vs Eloquent: e.g. `api_response_code` migrated as nullable string; service may store numeric-ish values.

### `fiscal_day_logs`

Audit of fiscal day operations (controller/repository present).

### `company_fiscal_day_schedules`

Per-company schedule: enable flags, open/close times, weekdays (JSON), timezone, last run dates; **FK** to `companies`.

### `non_fiscalized_companies`

Lead/onboarding records for companies not yet fully fiscal (public registration flow).

### Axis Billing mirror tables

`external_subscriptions`, `external_invoices`, `external_payments`, `axis_webhook_deliveries` — sync billing state from webhooks/API.

### System tables

`cache`, `jobs`, `sessions`, `password_reset_tokens`, `audits`, `settings` (Spatie), `telescope_entries`, failed jobs (if enabled).

---

## Section 3 — ZIMRA / Fiscal Device Integration

### External systems

1. **ZIMRA FDMS — Virtual Fiscal Device HTTP API**  
   Base URL from config: `config('services.zimra.api_url')`, defaulting from `.env` `ZIMRA_API_URL`. Examples in repo: `https://fdmsapitest.zimra.co.zw` (test) or internal IP `http://140.82.25.196:10005` (see `scripts/environment.txt`).  
   **No API key or Bearer token** is attached to these calls in `ZimraFiscalService` — integration appears **IP/device-bound** at the infrastructure layer (assumption; not documented in code).

2. **Fiscal Cloud** (`FiscalCloudApiService`) — separate **HTTPS JSON/multipart** API for e-invoicing company/device lifecycle. Optional header `X-API-Key: <FISCALCLOUD_API_KEY>`.

3. **Docs AI** (`DocsAiApiService`) — `POST {DOCS_AI_URL}/api/docs-ai/register-company` returns ZIMRA **device id** and **activation key** (in `values[0]` and `values[1]`).

### Fiscalization flow (end-to-end, plain English)

**Onboarding (first time):**

1. User completes **Apply fiscalization** (`POST /api/fiscal-companies/apply`): uploads tax certificate, company details → Fiscal Cloud **register company** → **create device** → local `companies` + `company_devices` rows → queue **`ActivateFiscalCloudDeviceJob`** with environment **`test`**.
2. Job calls **Docs AI** `register-company` with taxpayer + device metadata (includes hardcoded `supplierId`).
3. Job stores `zimra_device_id` and `zimra_activation_key`, then calls Fiscal Cloud **`POST /einvoicing/devices/{id}/activate`** with `{ device_id, activation_key, environment }`.
4. On success, **`SendZimraFdmsTemplateEmailJob`** may run: generates **sample fiscalized USD+ZWG invoices** via `SampleFiscalizationService`, renders PDFs, fills **FDMS Excel template**, emails support.

**Per invoice (fiscalize):**

1. User creates **DRAFT** invoice via `POST /api/invoices` (requires **active** `ExternalSubscription` for that company’s `axis_billing_customer_id`).
2. User calls **`POST /api/invoices/{id}/fiscalize`**.
3. `ZimraFiscalService::submitFiscalInvoice`:
   - **`GET {base}/api/VirtualDevice/GetStatus`** — must return `Code == "1"`. Reads `Data.fiscalDayStatus`; if `FiscalDayClosed`, aborts with message to open fiscal day first.
   - Builds **SubmitReceipt JSON** from invoice + lines + buyer (see below).
   - **`POST {base}/api/VirtualDevice/SubmitReceipt`** with JSON body.
   - On `Code == "1"`: updates invoice to `SUBMITTED`, saves `FiscalResponse`, returns success payload.
   - On failure: returns `422` from controller with message; may still persist a `FiscalResponse` row (best effort).

### HTTP endpoints (ZIMRA Virtual Device — as coded)

| Step | Method | URL | Auth | Body / params |
|------|--------|-----|------|----------------|
| Device status | GET | `{ZIMRA_API_URL}/api/VirtualDevice/GetStatus` | None in code | — |
| Open fiscal day | GET | `{ZIMRA_API_URL}/api/VirtualDevice/OpenFiscalDay` | None | — |
| Close fiscal day | GET | `{ZIMRA_API_URL}/api/VirtualDevice/CloseFiscalDay` | None | — |
| Submit receipt | POST | `{ZIMRA_API_URL}/api/VirtualDevice/SubmitReceipt` | Headers: `Content-Type: application/json`, `Accept: */*` | JSON payload (below) |

**Additional method present but not routed:** `getFiscalDayStatus(CompanyDevice $device)` calls **`GET {base}/api/fiscal/day/status?deviceId={fiscal_device_id}`** — different path shape; **not** used by `InvoiceController`.

### SubmitReceipt request body (built in PHP)

The payload is built in `ZimraFiscalService::buildInvoicePayload`:

```php
[
  'receiptType' => $invoice->receipt_type,           // FiscalInvoice | CreditNote | DebitNote
  'receiptCurrency' => $invoice->receipt_currency,   // e.g. USD, ZWG
  'invoiceNo' => $invoice->invoice_no,
  'referenceNumber' => $invoice->customer_reference ?? '',
  'invoiceAmount' => (float) $invoice->receipt_total,
  'invoiceTaxAmount' => /* computed: see VAT section */,
  'receiptNotes' => non-empty notes or 'N/A',
  'receiptLinesTaxInclusive' => (bool) $invoice->tax_inclusive,
  'moneyTypeCode' => $invoice->payment_method,       // CASH, CARD, ...
  'receiptPrintForm' => $invoice->receipt_print_form,// InvoiceA4 | Receipt48
  'buyerRegisterName' => (string) ($invoice->buyer->name ?? ''),
  'buyerTradeName' => (string) ($invoice->buyer->name ?? ''),
  'vatNumber' => '',
  'buyerTIN' => (string) ($invoice->buyer->tin ?? ''),
  'buyerPhoneNo' => (string) ($invoice->buyer->phone ?? ''),
  'buyerEmail' => (string) ($invoice->buyer->email ?? ''),
  'buyerProvince' => '',
  'buyerStreet' => (string) ($invoice->buyer->address ?? ''),
  'buyerHouseNo' => '',
  'buyerCity' => '',
  'receiptLines' => [
    [
      'receiptLineType' => 'Sale',
      'receiptLineNo' => 1..n,
      'receiptLineHSCode' => (string) $line->hs_code,
      'receiptLineName' => description,
      'receiptLinePrice' => unit_price float,
      'receiptLineQuantity' => quantity float,
      'receiptLineTotal' => round(qty * unit_price, 2), // tax-inclusive basis
      'taxCode' => A/B/C,
      'taxPercent' => float,
    ],
    // ...
  ],
]
```

**VAT amount sent:** If `tax_inclusive`, sum per line: `lineTotal - lineTotal / (1 + taxPercent/100)` with `lineTotal = qty * unit_price` (rounded per line). Else use sum of line `vat_amount` or header `total_vat`.

### Typical response handling (as implemented)

The code accepts multiple possible JSON shapes (ZIMRA versioning). Success: HTTP OK and **`Code` / `code` === `"1"`**.

Fiscal fields extracted (from `data`, `Data`, or top level):

- `qrCodeUrl` / `QRCode`
- `verificationCode` / `VerificationCode`
- `verificationLink` / `VerificationLink`
- `fiscalDayNo` / `FiscalDayNo`
- `fdmsInvoiceNo` / `FDMSInvoiceNo`
- `receiptGlobalNo`, `receiptCounter`, `receiptId` (several nesting variants)
- Device resolution: `DeviceID`, `DeviceSerialNumber`

**The code does not document a single canonical JSON schema** — it defensively reads alternates. For a Next.js rewrite, **log one real response** from your environment and treat that as canonical, keeping the fallbacks if you must interoperate with multiple gateway versions.

### QR code

- **Backend PDF:** `InvoicePdfService` uses **endroid/qr-code** `Builder` + `PngWriter`. **Payload string** = `verification_link` if set, else `qr_code_url` from `FiscalResponse`.
- **Frontend PDF/print:** `qrcode` package `QRCode.toDataURL`. **Payload** = `fiscalResponse.qr_code_url` if set, else `verification_link` (`invoices.component.ts` `getQrSourceValue`).
- **Format:** Plain **text or URL string** encoded into **PNG** QR (not binary custom format in app code). **Legal meaning:** QR is a **machine-readable pointer** to verification data (URL or ZIMRA-provided QR payload string); exact statutory wording is outside the repo.

### Signing / hashing

- **Invoice submission:** No client-side digital signature is applied in `ZimraFiscalService` — payload is JSON over HTTPS.
- **Webhooks:** Axis Billing webhook uses **HMAC-SHA256** of raw body with shared secret (`X-Axis-Signature`). This is **not** ZIMRA signing.

### Device / merchant registration

- **Fiscal Cloud:** multipart company registration + JSON device create + JSON activate (see `FiscalCloudApiService`).
- **Docs AI:** JSON `register-company` returning two scalar values for ZIMRA pairing.
- **FDMS production form:** `ZimraFdmsTemplateService` fills `ZIMRA_FDMS_TEMPLATE_PATH` Excel and embeds generated PDFs into OLE objects.

### Error handling & retries

- Fiscalize: **no automatic retry** on ZIMRA failure; user sees error toast / HTTP 422.
- **ActivateFiscalCloudDeviceJob:** `tries = 5`, exponential backoff.
- **Scheduled fiscal day:** open/close jobs log warnings and throw on failure (Horizon retry per job).
- Failed fiscalization may still create `fiscal_response` with error info (persistence wrapped in try/catch — success path still depends on `Code === "1"`).

### Test vs production

- **ZIMRA:** `.env.example` uses **`https://fdmsapitest.zimra.co.zw`** — naming implies **test**. Production URL must be supplied per ZIMRA deployment guidance.
- **Device activation environment:** `ActivateFiscalCloudDeviceJob` is dispatched with **`'test'`** from `FiscalCompanyApplyController` — **not** driven by env flag in that path (potential gap for production cutover).
- **`ZIMRA_API_KEY` / `ZIMRA_TENANT_ID`:** Present in `config/services.php` but **not used** by `ZimraFiscalService` (see Section 9).

---

## Section 4 — Invoice Generation Flow

### Triggers

- **Draft save:** Invoice builder → `POST /api/invoices`.
- **Fiscalize:** Builder or list → create invoice then `POST /api/invoices/{id}/fiscalize`, or open draft and fiscalize from list.
- **Sample invoices:** `SampleFiscalizationService` used by FDMS email job (automated).

### Required input (API validation, summary)

From `InvoiceData::validationRules`: `invoice_no`, `receipt_type`, `receipt_print_form`, `receipt_date`, `receipt_total`, `payment_method`, `payment_amount`, optional `device_id`, `buyer_id`, nested `lines` / `taxes`, etc. Controller recomputes totals from lines when lines present.

### Processing steps

1. **Normalize lines** (tax-inclusive VAT extraction, totals).
2. **Persist** invoice + lines + taxes in a transaction.
3. **Fiscalize:** status checks, build ZIMRA payload, HTTP submit, persist fiscal response, set `SUBMITTED`.
4. **PDF (server):** `InvoicePdfService::renderToStorage` loads Blade `pdf.invoice`, embeds QR if fiscal data exists.
5. **PDF (client):** `InvoicePdfService` (Angular) builds A4 layout with jsPDF; optional QR image.

### Final document content (typical)

- Title / receipt type, document number, date, currency, payment.
- **Company + customer** blocks (frontend PDF); server PDF is shorter (company from `$invoice->company` not fully duplicated in template — see Blade).
- Line table: description, HS, qty, unit, tax, totals.
- Totals: excl, VAT, grand total.
- **Fiscal block:** verification code, links, FDMS invoice no, QR image.

### Delivery

- **Download:** Browser PDF from Angular; server PDFs written under `storage/app/templates/...`.
- **Email:** FDMS template mail to configured address (internal ops).
- **Print:** `window.open` HTML document + `print()` in `invoices.component.ts`.

### Invoice numbering

- **User-entered** `invoice_no` with DB **unique** constraint.
- **Samples:** `INV-{CCY}-{YmdHis}-{RAND4}` style in `SampleFiscalizationService`.

### Tax / VAT

- Tax codes **A/B/C** (seeded reference rates).
- **Inclusive:** VAT extracted as `total - total/(1+p/100)` per line in multiple places (controller + ZIMRA service) for consistency with FDMS.

---

## Section 5 — Frontend — Invoice UI

| Area | Path | Role |
|------|------|------|
| Routes | `app.routes.ts` | `/invoice/new/fiscal-invoice`, credit/debit variants, `/invoices`, `/fiscal-day`, `/apply-fiscalization`, settings fiscal schedule |
| Invoice builder | `features/invoice/invoice-builder.component.*` | Main form: lines, buyers, products, HS autocomplete, save draft, **save + fiscalize** (creates invoice then fiscalize API) |
| Invoice list | `features/invoices/invoices.component.*` | Table, **fiscalize** action, dialog preview, **QR preview**, PDF download, print |
| Fiscal day UI | `features/fiscal-day/*` | Status, open/close buttons |
| Fiscal setup | `features/fiscal-setup/*` | Apply flow entry |
| Company | `features/company/*` | Shows fiscal payload/status |
| Guest invoice | `features/guest-invoice/*` | Non-auth invoice path (no fiscalize) |
| Global dialog | `components/fiscalization-dialog/*` | Prompt to apply fiscalization |
| API | `services/api.service.ts` | All REST calls, types for `Invoice`, `FiscalResponse` |
| PDF | `services/invoice-pdf.service.ts` | jsPDF layout + fiscal block |
| Auth | `interceptors/auth-token.interceptor.ts`, `auth.guard.ts` | Bearer token |

**State:** Angular **signals** (`signal`, `computed`) in modern components; RxJS for HTTP.

**Fiscalization status:** Shown via invoice `status`, `fiscalResponse` fields, toast messages, and PDF/print fiscal section.

---

## Section 6 — Backend — API Routes (`routes/api.php`)

Prefix: **`/api`** (Laravel default). Unless noted, routes below use **`auth:sanctum`**.

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| POST | `/api/webhooks/axis-billing` | `AxisBillingWebhookController` | Billing webhooks (HMAC) |
| POST | `/api/public/register`, `login`, … | `AuthController` | Public auth |
| POST | `/api/public/fiscal-cloud/companies` | `FiscalCloudCompanyController@store` | Public proxy register |
| GET/POST | many | various | CRUD (resource routes) |
| POST | `/api/invoices/{id}/fiscalize` | `InvoiceController@fiscalize` | **Fiscalize** |
| GET | `/api/fiscal/day/status` | `InvoiceController@fiscalDayStatus` | GetStatus bridge |
| POST | `/api/fiscal/day/open` | `InvoiceController@openFiscalDay` | Open day |
| POST | `/api/fiscal/day/close` | `InvoiceController@closeFiscalDay` | Close day |
| POST | `/api/fiscal-companies/apply` | `FiscalCompanyApplyController@apply` | Full onboarding + job |

**Typical errors:** `401` unauthenticated, `402` subscription required (invoice store), `404` not found, `422` validation / fiscal failure / business rule.

**Middleware:** `auth:sanctum`, `throttle` on selected routes.

**Admin (Inertia):** `routes/admin.php` — separate session auth + `super_admin` for internal ops (companies, devices, integration settings UI).

---

## Section 7 — Authentication and Security

- **SPA API:** Laravel Sanctum **personal access tokens**; `Authorization: Bearer`.
- **Admin:** Session + `EnsureSuperAdmin` for `/admin` area.
- **Fiscal Cloud / Docs AI:** Service URLs and API keys in **env + DB integration settings** (sensitive).
- **ZIMRA Virtual Device calls:** **No app-level credential** in `ZimraFiscalService` — security relies on **network placement** / device binding (verify with your ops team).
- **Webhooks:** HMAC-SHA256 with shared secret; constant-time compare `hash_equals`.
- **Secrets:** `.env`, Spatie settings in DB, never commit real `.env`.

---

## Section 8 — Environment Variables and Configuration

| Variable | Meaning | Test vs prod | Where set |
|----------|---------|--------------|-----------|
| `APP_*` | Laravel app identity, debug, URL, timezone | both | `.env` |
| `DB_*` | PostgreSQL connection | both | `.env` |
| `ZIMRA_API_URL` | Virtual Device base URL | test: `fdmsapitest`; prod: per ZIMRA | `.env` → overridden by DB `integration.zimra_api_url` |
| `ZIMRA_API_KEY`, `ZIMRA_TENANT_ID` | Declared in config | **Unused** in fiscal HTTP client | `.env` |
| `ZIMRA_FDMS_TEMPLATE_PATH` | Excel template path | both | `.env` |
| `ZIMRA_FDMS_EMAIL_TO` | FDMS email recipient | ops | `.env` |
| `FISCALCLOUD_API_URL`, `FISCALCLOUD_API_KEY`, `FISCALCLOUD_API_TIMEOUT` | Fiscal Cloud client | both | `.env` + DB |
| `DOCS_AI_URL`, `DOCS_AI_*_TIMEOUT` | Docs AI service | both | `.env` + DB `docs_ai_url` |
| `AXIS_BILLING_*` | Billing integration | both | `.env` + DB |
| `GOOGLE_*`, `FACEBOOK_*` | OAuth | optional | `.env` + DB |
| `FRONTEND_URL` | CORS / links | both | `.env` |

**How to obtain:** ZIMRA/Fiscal Cloud/Docs AI credentials come from **Axis / ZIMRA onboarding**, not from this repo.

---

## Section 9 — What Is Fully Working vs Incomplete

### Working (per code paths)

- Full **Fiscal Cloud register → device → activate queue → Docs AI → ZIMRA keys → Fiscal Cloud activate**.
- **SubmitReceipt** fiscalization with pre-flight **GetStatus** and fiscal day gate.
- **Fiscal response persistence**, invoice status transition, Angular **fiscalize** UX, PDFs with QR.
- **Scheduled fiscal day** open/close **queued** (uses same global ZIMRA client — **not** per-tenant device parameter in `ZimraFiscalService` HTTP calls).

### Gaps / risks / bugs

1. **Buyer fields bug:** `ZimraFiscalService::buildInvoicePayload` uses `$invoice->buyer->name` and `address`, but `Buyer` model uses **`register_name`** and structured address fields — buyer name/address may be **empty strings** on ZIMRA submission unless Eloquent adds dynamic attributes not visible in model file. **Fix would use `register_name` / composed address.**
2. **`ZIMRA_API_KEY` / `ZIMRA_TENANT_ID`:** Not referenced by fiscal client — either **legacy** or **missing implementation**.
3. **`getFiscalDayStatus` vs `GetStatus`:** Two different URL patterns; only **GetStatus** is exposed to SPA.
4. **Multi-tenant virtual device:** Service methods use **global** `ZIMRA_API_URL` with **no** `deviceId` in SubmitReceipt payload — implies **one device per deployment** or gateway routes by infrastructure. **Not documented in code.**
5. **Activation environment hardcoded `test`** in `FiscalCompanyApplyController`.
6. **Empty migration:** `2026_03_17_172455_add_fiscalization_status_to_companies_table.php` is a no-op.
7. **Commented code:** `SampleFiscalizationService` has **credit/debit** sample generation **commented out**.
8. **No TODO/FIXME grep hits** in `php/ts` — still manual review found above.

### Frontend/backend shape mismatches

- API returns `line_total_incl`; frontend often expects `line_total` — **normalized** in `invoices.component.ts`.
- Fiscal response may appear as `fiscal_response` (snake) — **normalized** to `fiscalResponse`.

---

## Section 10 — Integration Guide for a Next.js Developer

### NPM packages (suggested)

- `qrcode` or `qrcode` + canvas — generate PNG/data URL for verification URL.
- `@react-pdf/renderer` or Puppeteer — PDF; or reuse jsPDF from client.
- `zod` — validate API payloads.
- HTTP: `fetch` or `axios`.

### Ordered HTTP calls (minimal fiscalize)

1. **Ensure fiscal day open**  
   `GET {ZIMRA_API_URL}/api/VirtualDevice/GetStatus`  
   - If `Code !== "1"` → stop (configuration/device error).  
   - If `Data.fiscalDayStatus === "FiscalDayClosed"` → `GET .../OpenFiscalDay` and recheck.

2. **Submit receipt**  
   `POST {ZIMRA_API_URL}/api/VirtualDevice/SubmitReceipt`  
   Headers: `Content-Type: application/json`  
   Body: mirror PHP structure in Section 3.

3. **Persist** verification fields in your DB keyed by invoice id.

### QR generation (Node)

```ts
import QRCode from 'qrcode';

const payload = verificationLink || qrCodeUrl; // string from ZIMRA
const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', width: 240 });
// embed dataUrl in PDF or HTML <img src="...">
```

### Storing fiscal results

Table similar to `fiscal_responses`: one row per invoice, store `raw_response` JSON for support.

### Minimal viable implementation

1. One API route: accept invoice lines + totals + buyer + seller metadata.
2. Call GetStatus + SubmitReceipt.
3. On success, save verification fields + set invoice status submitted.
4. Render PDF with QR from `verification_link`.

### Gotchas

- **Line totals:** ZIMRA uses **qty × unit_price** (rounded) for inclusive lines — keep **one rounding strategy** aligned with PHP or validation fails.
- **Credit notes:** PHP comments note sign conventions (negative unit price vs negative qty) — test with ZIMRA validator.
- **Currency:** Must match configured device capabilities (sample flow generates **USD** and **ZWG**).
- **Environment:** Distinguish **Fiscal Cloud `environment`** (activation) from **ZIMRA base URL** (test vs prod).

### Example shapes (illustrative)

**SubmitReceipt (conceptual):**

```json
{
  "receiptType": "FiscalInvoice",
  "receiptCurrency": "USD",
  "invoiceNo": "INV-USD-20260418-AB12",
  "referenceNumber": "",
  "invoiceAmount": 115.0,
  "invoiceTaxAmount": 15.0,
  "receiptNotes": "N/A",
  "receiptLinesTaxInclusive": true,
  "moneyTypeCode": "CASH",
  "receiptPrintForm": "InvoiceA4",
  "buyerRegisterName": "Customer Ltd",
  "buyerTradeName": "Customer Ltd",
  "vatNumber": "",
  "buyerTIN": "1234567890",
  "buyerPhoneNo": "",
  "buyerEmail": "",
  "buyerProvince": "",
  "buyerStreet": "123 Main",
  "buyerHouseNo": "",
  "buyerCity": "",
  "receiptLines": [
    {
      "receiptLineType": "Sale",
      "receiptLineNo": 1,
      "receiptLineHSCode": "12345678",
      "receiptLineName": "Consulting",
      "receiptLinePrice": 100.0,
      "receiptLineQuantity": 1.0,
      "receiptLineTotal": 100.0,
      "taxCode": "A",
      "taxPercent": 15.0
    }
  ]
}
```

**Success response (illustrative — actual keys vary):**

```json
{
  "Code": "1",
  "Message": "OK",
  "data": {
    "verificationCode": "ABC123",
    "verificationLink": "https://...",
    "qrCodeUrl": "https://...",
    "fiscalDayNo": 12,
    "fdmsInvoiceNo": "..."
  }
}
```

---

## Section 11 — Complete File Manifest

﻿### Complete file manifest (all paths under `ref-codebases/invoicing/`)

- `backend/.editorconfig` - EditorConfig: indentation and charset rules.
- `backend/.env.example` - Example environment variables for Laravel backend.
- `backend/.gitattributes` - Git attributes (line endings, LFS, etc.).
- `backend/.gitignore` - Git ignore patterns.
- `backend/app/Console/Commands/MakeFullModel.php` - Artisan command: MakeFullModel.
- `backend/app/Console/Commands/ProcessFiscalDaySchedules.php` - Artisan command: ProcessFiscalDaySchedules.
- `backend/app/Data/BankingDetailData.php` - Spatie Data DTO + validation: BankingDetailData.
- `backend/app/Data/BuyerData.php` - Spatie Data DTO + validation: BuyerData.
- `backend/app/Data/CompanyData.php` - Spatie Data DTO + validation: CompanyData.
- `backend/app/Data/CompanyDeviceData.php` - Spatie Data DTO + validation: CompanyDeviceData.
- `backend/app/Data/FiscalDayLogData.php` - Spatie Data DTO + validation: FiscalDayLogData.
- `backend/app/Data/FiscalResponseData.php` - Spatie Data DTO + validation: FiscalResponseData.
- `backend/app/Data/HsCodeData.php` - Spatie Data DTO + validation: HsCodeData.
- `backend/app/Data/InvoiceData.php` - Spatie Data DTO + validation: InvoiceData.
- `backend/app/Data/InvoiceLineData.php` - Spatie Data DTO + validation: InvoiceLineData.
- `backend/app/Data/InvoiceTaxData.php` - Spatie Data DTO + validation: InvoiceTaxData.
- `backend/app/Data/ProductData.php` - Spatie Data DTO + validation: ProductData.
- `backend/app/Data/UserData.php` - Spatie Data DTO + validation: UserData.
- `backend/app/Exceptions/AxisBillingException.php` - Exception class: AxisBillingException.
- `backend/app/Http/Controllers/Admin/Auth/AuthenticatedSessionController.php` - HTTP controller: AuthenticatedSessionController.
- `backend/app/Http/Controllers/Admin/BuyerController.php` - HTTP controller: BuyerController.
- `backend/app/Http/Controllers/Admin/CompanyController.php` - HTTP controller: CompanyController.
- `backend/app/Http/Controllers/Admin/CompanyDeviceController.php` - HTTP controller: CompanyDeviceController.
- `backend/app/Http/Controllers/Admin/Concerns/ResolvesAdminTableQuery.php` - HTTP controller: ResolvesAdminTableQuery.
- `backend/app/Http/Controllers/Admin/DashboardController.php` - HTTP controller: DashboardController.
- `backend/app/Http/Controllers/Admin/IntegrationSettingsController.php` - HTTP controller: IntegrationSettingsController.
- `backend/app/Http/Controllers/Admin/InvoiceController.php` - HTTP controller: InvoiceController.
- `backend/app/Http/Controllers/Admin/ProductController.php` - HTTP controller: ProductController.
- `backend/app/Http/Controllers/Admin/SettingsController.php` - HTTP controller: SettingsController.
- `backend/app/Http/Controllers/Admin/UserActivationCodeController.php` - HTTP controller: UserActivationCodeController.
- `backend/app/Http/Controllers/Admin/UserController.php` - HTTP controller: UserController.
- `backend/app/Http/Controllers/Admin/UserPasswordController.php` - HTTP controller: UserPasswordController.
- `backend/app/Http/Controllers/Api/AuthController.php` - HTTP controller: AuthController.
- `backend/app/Http/Controllers/Api/FiscalCloudCompanyController.php` - HTTP controller: FiscalCloudCompanyController.
- `backend/app/Http/Controllers/Api/FiscalCompanyApplyController.php` - HTTP controller: FiscalCompanyApplyController.
- `backend/app/Http/Controllers/Api/NonFiscalizedCompanyController.php` - HTTP controller: NonFiscalizedCompanyController.
- `backend/app/Http/Controllers/Api/OAuthController.php` - HTTP controller: OAuthController.
- `backend/app/Http/Controllers/Api/UserActivationCodeController.php` - HTTP controller: UserActivationCodeController.
- `backend/app/Http/Controllers/AxisBilling/CheckoutSessionsController.php` - HTTP controller: CheckoutSessionsController.
- `backend/app/Http/Controllers/AxisBilling/PlansController.php` - HTTP controller: PlansController.
- `backend/app/Http/Controllers/AxisBilling/ProductsController.php` - HTTP controller: ProductsController.
- `backend/app/Http/Controllers/AxisBilling/SubscriptionsController.php` - HTTP controller: SubscriptionsController.
- `backend/app/Http/Controllers/BankingDetailController.php` - HTTP controller: BankingDetailController.
- `backend/app/Http/Controllers/BuyerController.php` - HTTP controller: BuyerController.
- `backend/app/Http/Controllers/CompanyController.php` - HTTP controller: CompanyController.
- `backend/app/Http/Controllers/CompanyDeviceController.php` - HTTP controller: CompanyDeviceController.
- `backend/app/Http/Controllers/CompanyHsCodeController.php` - HTTP controller: CompanyHsCodeController.
- `backend/app/Http/Controllers/Concerns/ResolvesTenantCompany.php` - HTTP controller: ResolvesTenantCompany.
- `backend/app/Http/Controllers/Controller.php` - HTTP controller: Controller.
- `backend/app/Http/Controllers/DashboardController.php` - HTTP controller: DashboardController.
- `backend/app/Http/Controllers/FiscalDayLogController.php` - HTTP controller: FiscalDayLogController.
- `backend/app/Http/Controllers/FiscalDayScheduleController.php` - HTTP controller: FiscalDayScheduleController.
- `backend/app/Http/Controllers/FiscalResponseController.php` - HTTP controller: FiscalResponseController.
- `backend/app/Http/Controllers/HsCodeController.php` - HTTP controller: HsCodeController.
- `backend/app/Http/Controllers/InvoiceController.php` - HTTP controller: InvoiceController.
- `backend/app/Http/Controllers/InvoiceLineController.php` - HTTP controller: InvoiceLineController.
- `backend/app/Http/Controllers/InvoiceTaxController.php` - HTTP controller: InvoiceTaxController.
- `backend/app/Http/Controllers/ProductController.php` - HTTP controller: ProductController.
- `backend/app/Http/Controllers/ReportController.php` - HTTP controller: ReportController.
- `backend/app/Http/Controllers/TaxRateController.php` - HTTP controller: TaxRateController.
- `backend/app/Http/Controllers/UnitOfMeasureController.php` - HTTP controller: UnitOfMeasureController.
- `backend/app/Http/Controllers/UserController.php` - HTTP controller: UserController.
- `backend/app/Http/Controllers/Webhooks/AxisBillingWebhookController.php` - HTTP controller: AxisBillingWebhookController.
- `backend/app/Http/Middleware/EnsureSuperAdmin.php` - HTTP middleware: EnsureSuperAdmin.
- `backend/app/Http/Middleware/HandleInertiaRequests.php` - HTTP middleware: HandleInertiaRequests.
- `backend/app/Http/Requests/BaseRequest.php` - Form request: BaseRequest.
- `backend/app/Http/Requests/Concerns/ValidatesHsCodeForTenant.php` - Form request: ValidatesHsCodeForTenant.
- `backend/app/Http/Requests/RegisterNonFiscalizedCompanyRequest.php` - Form request: RegisterNonFiscalizedCompanyRequest.
- `backend/app/Http/Requests/StoreBankingDetailRequest.php` - Form request: StoreBankingDetailRequest.
- `backend/app/Http/Requests/StoreBuyerRequest.php` - Form request: StoreBuyerRequest.
- `backend/app/Http/Requests/StoreCompanyDeviceRequest.php` - Form request: StoreCompanyDeviceRequest.
- `backend/app/Http/Requests/StoreCompanyRequest.php` - Form request: StoreCompanyRequest.
- `backend/app/Http/Requests/StoreFiscalDayLogRequest.php` - Form request: StoreFiscalDayLogRequest.
- `backend/app/Http/Requests/StoreFiscalResponseRequest.php` - Form request: StoreFiscalResponseRequest.
- `backend/app/Http/Requests/StoreHsCodeRequest.php` - Form request: StoreHsCodeRequest.
- `backend/app/Http/Requests/StoreInvoiceLineRequest.php` - Form request: StoreInvoiceLineRequest.
- `backend/app/Http/Requests/StoreInvoiceRequest.php` - Form request: StoreInvoiceRequest.
- `backend/app/Http/Requests/StoreInvoiceTaxRequest.php` - Form request: StoreInvoiceTaxRequest.
- `backend/app/Http/Requests/StoreProductRequest.php` - Form request: StoreProductRequest.
- `backend/app/Http/Requests/StoreUnitOfMeasureRequest.php` - Form request: StoreUnitOfMeasureRequest.
- `backend/app/Http/Requests/StoreUserRequest.php` - Form request: StoreUserRequest.
- `backend/app/Http/Requests/SyncCompanyHsCodePreferencesRequest.php` - Form request: SyncCompanyHsCodePreferencesRequest.
- `backend/app/Http/Requests/UpdateBankingDetailRequest.php` - Form request: UpdateBankingDetailRequest.
- `backend/app/Http/Requests/UpdateBuyerRequest.php` - Form request: UpdateBuyerRequest.
- `backend/app/Http/Requests/UpdateCompanyDeviceRequest.php` - Form request: UpdateCompanyDeviceRequest.
- `backend/app/Http/Requests/UpdateCompanyRequest.php` - Form request: UpdateCompanyRequest.
- `backend/app/Http/Requests/UpdateFiscalDayLogRequest.php` - Form request: UpdateFiscalDayLogRequest.
- `backend/app/Http/Requests/UpdateFiscalDayScheduleRequest.php` - Form request: UpdateFiscalDayScheduleRequest.
- `backend/app/Http/Requests/UpdateFiscalResponseRequest.php` - Form request: UpdateFiscalResponseRequest.
- `backend/app/Http/Requests/UpdateHsCodeRequest.php` - Form request: UpdateHsCodeRequest.
- `backend/app/Http/Requests/UpdateInvoiceLineRequest.php` - Form request: UpdateInvoiceLineRequest.
- `backend/app/Http/Requests/UpdateInvoiceRequest.php` - Form request: UpdateInvoiceRequest.
- `backend/app/Http/Requests/UpdateInvoiceTaxRequest.php` - Form request: UpdateInvoiceTaxRequest.
- `backend/app/Http/Requests/UpdateProductRequest.php` - Form request: UpdateProductRequest.
- `backend/app/Http/Requests/UpdateUnitOfMeasureRequest.php` - Form request: UpdateUnitOfMeasureRequest.
- `backend/app/Http/Requests/UpdateUserRequest.php` - Form request: UpdateUserRequest.
- `backend/app/Jobs/ActivateFiscalCloudDeviceJob.php` - Queued job: ActivateFiscalCloudDeviceJob.
- `backend/app/Jobs/RunScheduledFiscalDayCloseJob.php` - Queued job: RunScheduledFiscalDayCloseJob.
- `backend/app/Jobs/RunScheduledFiscalDayOpenJob.php` - Queued job: RunScheduledFiscalDayOpenJob.
- `backend/app/Jobs/SendZimraFdmsTemplateEmailJob.php` - Queued job: SendZimraFdmsTemplateEmailJob.
- `backend/app/Mail/ZimraFdmsTemplateMail.php` - Mailable: ZimraFdmsTemplateMail.
- `backend/app/Models/AxisWebhookDelivery.php` - Eloquent model: AxisWebhookDelivery.
- `backend/app/Models/BankingDetail.php` - Eloquent model: BankingDetail.
- `backend/app/Models/Buyer.php` - Eloquent model: Buyer.
- `backend/app/Models/Company.php` - Eloquent model: Company.
- `backend/app/Models/CompanyDevice.php` - Eloquent model: CompanyDevice.
- `backend/app/Models/CompanyFiscalDaySchedule.php` - Eloquent model: CompanyFiscalDaySchedule.
- `backend/app/Models/CompanyHsCode.php` - Eloquent model: CompanyHsCode.
- `backend/app/Models/ExternalInvoice.php` - Eloquent model: ExternalInvoice.
- `backend/app/Models/ExternalPayment.php` - Eloquent model: ExternalPayment.
- `backend/app/Models/ExternalSubscription.php` - Eloquent model: ExternalSubscription.
- `backend/app/Models/FiscalDayLog.php` - Eloquent model: FiscalDayLog.
- `backend/app/Models/FiscalResponse.php` - Eloquent model: FiscalResponse.
- `backend/app/Models/HsCode.php` - Eloquent model: HsCode.
- `backend/app/Models/Invoice.php` - Eloquent model: Invoice.
- `backend/app/Models/InvoiceLine.php` - Eloquent model: InvoiceLine.
- `backend/app/Models/InvoiceTax.php` - Eloquent model: InvoiceTax.
- `backend/app/Models/NonFiscalizedCompany.php` - Eloquent model: NonFiscalizedCompany.
- `backend/app/Models/Product.php` - Eloquent model: Product.
- `backend/app/Models/TaxRate.php` - Eloquent model: TaxRate.
- `backend/app/Models/UnitOfMeasure.php` - Eloquent model: UnitOfMeasure.
- `backend/app/Models/User.php` - Eloquent model: User.
- `backend/app/Models/UserActivationCode.php` - Eloquent model: UserActivationCode.
- `backend/app/Providers/AppServiceProvider.php` - Service provider: AppServiceProvider.
- `backend/app/Providers/HorizonServiceProvider.php` - Service provider: HorizonServiceProvider.
- `backend/app/Providers/TelescopeServiceProvider.php` - Service provider: TelescopeServiceProvider.
- `backend/app/Repositories/BankingDetailRepository.php` - Repository: BankingDetailRepository.
- `backend/app/Repositories/BaseRepository.php` - Repository: BaseRepository.
- `backend/app/Repositories/BuyerRepository.php` - Repository: BuyerRepository.
- `backend/app/Repositories/CompanyDeviceRepository.php` - Repository: CompanyDeviceRepository.
- `backend/app/Repositories/CompanyRepository.php` - Repository: CompanyRepository.
- `backend/app/Repositories/FiscalDayLogRepository.php` - Repository: FiscalDayLogRepository.
- `backend/app/Repositories/FiscalResponseRepository.php` - Repository: FiscalResponseRepository.
- `backend/app/Repositories/HsCodeRepository.php` - Repository: HsCodeRepository.
- `backend/app/Repositories/Interfaces/BankingDetailRepositoryInterface.php` - Repository interface: BankingDetailRepositoryInterface.
- `backend/app/Repositories/Interfaces/BuyerRepositoryInterface.php` - Repository interface: BuyerRepositoryInterface.
- `backend/app/Repositories/Interfaces/CompanyDeviceRepositoryInterface.php` - Repository interface: CompanyDeviceRepositoryInterface.
- `backend/app/Repositories/Interfaces/CompanyRepositoryInterface.php` - Repository interface: CompanyRepositoryInterface.
- `backend/app/Repositories/Interfaces/FiscalDayLogRepositoryInterface.php` - Repository interface: FiscalDayLogRepositoryInterface.
- `backend/app/Repositories/Interfaces/FiscalResponseRepositoryInterface.php` - Repository interface: FiscalResponseRepositoryInterface.
- `backend/app/Repositories/Interfaces/HsCodeRepositoryInterface.php` - Repository interface: HsCodeRepositoryInterface.
- `backend/app/Repositories/Interfaces/InvoiceLineRepositoryInterface.php` - Repository interface: InvoiceLineRepositoryInterface.
- `backend/app/Repositories/Interfaces/InvoiceRepositoryInterface.php` - Repository interface: InvoiceRepositoryInterface.
- `backend/app/Repositories/Interfaces/InvoiceTaxRepositoryInterface.php` - Repository interface: InvoiceTaxRepositoryInterface.
- `backend/app/Repositories/Interfaces/ProductRepositoryInterface.php` - Repository interface: ProductRepositoryInterface.
- `backend/app/Repositories/Interfaces/RepositoryInterface.php` - Repository interface: RepositoryInterface.
- `backend/app/Repositories/Interfaces/UserRepositoryInterface.php` - Repository interface: UserRepositoryInterface.
- `backend/app/Repositories/InvoiceLineRepository.php` - Repository: InvoiceLineRepository.
- `backend/app/Repositories/InvoiceRepository.php` - Repository: InvoiceRepository.
- `backend/app/Repositories/InvoiceTaxRepository.php` - Repository: InvoiceTaxRepository.
- `backend/app/Repositories/ProductRepository.php` - Repository: ProductRepository.
- `backend/app/Repositories/UserRepository.php` - Repository: UserRepository.
- `backend/app/Services/AxisBillingClient.php` - Laravel service: AxisBillingClient.
- `backend/app/Services/DocsAiApiService.php` - Docs AI HTTP client (ZIMRA device registration helper).
- `backend/app/Services/FiscalCloudApiService.php` - Fiscal Cloud HTTP client (company, device, activate).
- `backend/app/Services/InvoicePdfService.php` - Server PDF + QR generation for invoices (DomPDF + Endroid).
- `backend/app/Services/ProductTemplatePicker.php` - Laravel service: ProductTemplatePicker.
- `backend/app/Services/SampleFiscalizationService.php` - Generates sample fiscalized invoices and PDFs for FDMS pack.
- `backend/app/Services/TenantHsCodeService.php` - Laravel service: TenantHsCodeService.
- `backend/app/Services/TenantUserProvisioningService.php` - Laravel service: TenantUserProvisioningService.
- `backend/app/Services/UnitOfMeasureService.php` - Laravel service: UnitOfMeasureService.
- `backend/app/Services/UserActivationCodeService.php` - Laravel service: UserActivationCodeService.
- `backend/app/Services/ZimraFdmsTemplateService.php` - FDMS Excel template fill and embedded PDF swap.
- `backend/app/Services/ZimraFiscalService.php` - ZIMRA Virtual Device API client (GetStatus, SubmitReceipt, fiscal day).
- `backend/app/Settings/ApplicationSettings.php` - Spatie settings class: ApplicationSettings.
- `backend/app/Settings/IntegrationSettings.php` - Spatie settings class: IntegrationSettings.
- `backend/artisan` - Laravel Artisan CLI entrypoint.
- `backend/bootstrap/app.php` - Laravel bootstrap: app.php.
- `backend/bootstrap/cache/.gitignore` - Git ignore patterns.
- `backend/bootstrap/providers.php` - Laravel bootstrap: providers.php.
- `backend/composer.json` - Backend/project file: backend/composer.json.
- `backend/composer.lock` - (binary) Composer dependency lockfile.
- `backend/config/app.php` - Laravel config: app.php.
- `backend/config/audit.php` - Laravel config: audit.php.
- `backend/config/auth.php` - Laravel config: auth.php.
- `backend/config/cache.php` - Laravel config: cache.php.
- `backend/config/cors.php` - Laravel config: cors.php.
- `backend/config/database.php` - Laravel config: database.php.
- `backend/config/filesystems.php` - Laravel config: filesystems.php.
- `backend/config/fiscalcloud.php` - Laravel config: fiscalcloud.php.
- `backend/config/horizon.php` - Laravel config: horizon.php.
- `backend/config/logging.php` - Laravel config: logging.php.
- `backend/config/log-viewer.php` - Laravel config: log-viewer.php.
- `backend/config/mail.php` - Laravel config: mail.php.
- `backend/config/queue.php` - Laravel config: queue.php.
- `backend/config/sanctum.php` - Laravel config: sanctum.php.
- `backend/config/scramble.php` - Laravel config: scramble.php.
- `backend/config/services.php` - Laravel config: services.php.
- `backend/config/session.php` - Laravel config: session.php.
- `backend/config/settings.php` - Laravel config: settings.php.
- `backend/config/telescope.php` - Laravel config: telescope.php.
- `backend/database/.gitignore` - Git ignore patterns.
- `backend/database/factories/UserFactory.php` - Eloquent model factory: UserFactory.
- `backend/database/HSCodes.csv` - HS codes seed data (CSV).
- `backend/database/migrations/0001_01_01_000001_create_cache_table.php` - Laravel migration: create_cache_table.
- `backend/database/migrations/0001_01_01_000002_create_jobs_table.php` - Laravel migration: create_jobs_table.
- `backend/database/migrations/2022_12_14_083707_create_settings_table.php` - Laravel migration: create_settings_table.
- `backend/database/migrations/2026_02_26_221414_create_companies_table.php` - Laravel migration: create_companies_table.
- `backend/database/migrations/2026_02_26_221415_create_company_devices_table.php` - Laravel migration: create_company_devices_table.
- `backend/database/migrations/2026_02_26_221415_create_users_table.php` - Laravel migration: create_users_table.
- `backend/database/migrations/2026_02_26_221416_create_banking_details_table.php` - Laravel migration: create_banking_details_table.
- `backend/database/migrations/2026_02_26_221416_create_buyers_table.php` - Laravel migration: create_buyers_table.
- `backend/database/migrations/2026_02_26_221417_create_products_table.php` - Laravel migration: create_products_table.
- `backend/database/migrations/2026_02_26_221418_create_hs_codes_table.php` - Laravel migration: create_hs_codes_table.
- `backend/database/migrations/2026_02_26_221419_create_invoices_table.php` - Laravel migration: create_invoices_table.
- `backend/database/migrations/2026_02_26_221420_create_invoice_lines_table.php` - Laravel migration: create_invoice_lines_table.
- `backend/database/migrations/2026_02_26_221420_create_invoice_taxes_table.php` - Laravel migration: create_invoice_taxes_table.
- `backend/database/migrations/2026_02_26_221421_create_fiscal_responses_table.php` - Laravel migration: create_fiscal_responses_table.
- `backend/database/migrations/2026_02_26_221423_create_fiscal_day_logs_table.php` - Laravel migration: create_fiscal_day_logs_table.
- `backend/database/migrations/2026_02_26_224343_create_audits_table.php` - Laravel migration: create_audits_table.
- `backend/database/migrations/2026_03_17_172455_add_fiscalization_status_to_companies_table.php` - Laravel migration: add_fiscalization_status_to_companies_table.
- `backend/database/migrations/2026_03_17_172641_create_non_fiscalized_companies_table.php` - Laravel migration: create_non_fiscalized_companies_table.
- `backend/database/migrations/2026_03_24_000000_add_auth0_user_id_to_companies_table.php` - Laravel migration: add_auth0_user_id_to_companies_table.
- `backend/database/migrations/2026_03_24_010000_change_audits_morph_ids_to_uuid_strings.php` - Laravel migration: change_audits_morph_ids_to_uuid_strings.
- `backend/database/migrations/2026_03_24_020000_create_hs_codes_table.php` - Laravel migration: create_hs_codes_table.
- `backend/database/migrations/2026_03_24_120000_make_device_id_nullable_on_invoices_table.php` - Laravel migration: make_device_id_nullable_on_invoices_table.
- `backend/database/migrations/2026_03_24_225110_create_personal_access_tokens_table.php` - Laravel migration: create_personal_access_tokens_table.
- `backend/database/migrations/2026_03_25_120000_create_company_hs_codes_table.php` - Laravel migration: create_company_hs_codes_table.
- `backend/database/migrations/2026_03_25_120001_add_hs_codes_catalog_indexes.php` - Laravel migration: add_hs_codes_catalog_indexes.
- `backend/database/migrations/2026_03_25_130500_alter_personal_access_tokens_tokenable_id_to_uuid.php` - Laravel migration: alter_personal_access_tokens_tokenable_id_to_uuid.
- `backend/database/migrations/2026_03_25_140000_create_tax_rates_table.php` - Laravel migration: create_tax_rates_table.
- `backend/database/migrations/2026_03_25_140001_create_units_of_measure_table.php` - Laravel migration: create_units_of_measure_table.
- `backend/database/migrations/2026_03_25_140002_create_company_fiscal_day_schedules_table.php` - Laravel migration: create_company_fiscal_day_schedules_table.
- `backend/database/migrations/2026_03_25_230000_remove_auth0_add_fiscal_cloud_user_id.php` - Laravel migration: remove_auth0_add_fiscal_cloud_user_id.
- `backend/database/migrations/2026_04_07_000001_create_axis_webhook_deliveries_table.php` - Laravel migration: create_axis_webhook_deliveries_table.
- `backend/database/migrations/2026_04_07_000002_create_external_subscriptions_table.php` - Laravel migration: create_external_subscriptions_table.
- `backend/database/migrations/2026_04_07_000003_add_axis_billing_team_id_to_companies_table.php` - Laravel migration: add_axis_billing_team_id_to_companies_table.
- `backend/database/migrations/2026_04_07_000004_add_axis_billing_customer_id_to_companies_table.php` - Laravel migration: add_axis_billing_customer_id_to_companies_table.
- `backend/database/migrations/2026_04_07_000005_create_external_invoices_table.php` - Laravel migration: create_external_invoices_table.
- `backend/database/migrations/2026_04_07_000006_create_external_payments_table.php` - Laravel migration: create_external_payments_table.
- `backend/database/migrations/2026_04_08_000001_alter_sessions_user_id_to_uuid.php` - Laravel migration: alter_sessions_user_id_to_uuid.
- `backend/database/migrations/2026_04_08_120000_create_user_activation_codes_table.php` - Laravel migration: create_user_activation_codes_table.
- `backend/database/migrations/2026_04_15_000001_add_oauth_fields_to_users_table.php` - Laravel migration: add_oauth_fields_to_users_table.
- `backend/database/migrations/2026_04_15_160000_add_fiscalcloud_api_key_to_integration_settings.php` - Laravel migration: add_fiscalcloud_api_key_to_integration_settings.
- `backend/database/migrations/2026_04_16_000001_add_fiscal_cloud_payloads_to_company_and_devices.php` - Laravel migration: add_fiscal_cloud_payloads_to_company_and_devices.
- `backend/database/migrations/2026_04_16_000002_add_zimra_activation_fields_to_company_devices.php` - Laravel migration: add_zimra_activation_fields_to_company_devices.
- `backend/database/migrations/2026_04_16_000005_add_activation_status_fields_to_company_devices.php` - Laravel migration: add_activation_status_fields_to_company_devices.
- `backend/database/migrations/2026_04_16_000006_add_fiscal_company_address_fields_to_companies_table.php` - Laravel migration: add_fiscal_company_address_fields_to_companies_table.
- `backend/database/migrations/2026_04_16_000006_add_zimra_fdms_template_emailed_at_to_company_devices.php` - Laravel migration: add_zimra_fdms_template_emailed_at_to_company_devices.
- `backend/database/migrations/2026_04_16_000007_add_zimra_fdms_invoices_generated_at_to_company_devices.php` - Laravel migration: add_zimra_fdms_invoices_generated_at_to_company_devices.
- `backend/database/migrations/2026_04_16_092302_create_telescope_entries_table.php` - Laravel migration: create_telescope_entries_table.
- `backend/database/seeders/DatabaseSeeder.php` - Database seeder: DatabaseSeeder.
- `backend/database/seeders/HsCodeSeeder.php` - Database seeder: HsCodeSeeder.
- `backend/database/seeders/SuperAdminSeeder.php` - Database seeder: SuperAdminSeeder.
- `backend/database/seeders/TaxRateSeeder.php` - Database seeder: TaxRateSeeder.
- `backend/database/settings/2026_04_08_000000_initialize_application_settings.php` - Spatie settings migration: 2026_04_08_000000_initialize_application_settings.
- `backend/database/settings/2026_04_08_120000_initialize_integration_settings.php` - Spatie settings migration: 2026_04_08_120000_initialize_integration_settings.
- `backend/database/settings/2026_04_15_100000_add_oauth_integration_settings.php` - Spatie settings migration: 2026_04_15_100000_add_oauth_integration_settings.
- `backend/database/settings/2026_04_16_000003_add_docs_ai_url_to_integration_settings.php` - Spatie settings migration: 2026_04_16_000003_add_docs_ai_url_to_integration_settings.
- `backend/database/settings/2026_04_16_000004_remove_fiscalcloud_api_token_setting.php` - Spatie settings migration: 2026_04_16_000004_remove_fiscalcloud_api_token_setting.
- `backend/docker-compose.yml` - Docker Compose services.
- `backend/package.json` - NPM manifest for Laravel Vite pipeline.
- `backend/package-lock.json` - (binary) NPM dependency lockfile.
- `backend/phpunit.xml` - PHP test runner configuration.
- `backend/public/.htaccess` - Public web root: .htaccess.
- `backend/public/favicon.ico` - (binary) Public image asset.
- `backend/public/index.php` - Public web root: index.php.
- `backend/public/robots.txt` - Public web root: robots.txt.
- `backend/README.md` - Backend readme.
- `backend/resources/css/app.css` - Laravel Vite CSS: app.css.
- `backend/resources/js/app.js` - Laravel Vite JS: app.js.
- `backend/resources/js/app.jsx` - Laravel Vite JS: app.jsx.
- `backend/resources/js/bootstrap.js` - Laravel Vite JS: bootstrap.js.
- `backend/resources/js/Components/Admin/TableControls.jsx` - Inertia/React component: TableControls.jsx.
- `backend/resources/js/Layouts/AdminLayout.jsx` - Inertia admin layout: AdminLayout.jsx.
- `backend/resources/js/Pages/Admin/Auth/Login.jsx` - Inertia/React admin page: Login.jsx.
- `backend/resources/js/Pages/Admin/Auth/Login.module.css` - Inertia/React admin page: Login.module.css.
- `backend/resources/js/Pages/Admin/Buyers/Index.jsx` - Inertia/React admin page: Index.jsx.
- `backend/resources/js/Pages/Admin/Companies/Edit.jsx` - Inertia/React admin page: Edit.jsx.
- `backend/resources/js/Pages/Admin/Companies/Index.jsx` - Inertia/React admin page: Index.jsx.
- `backend/resources/js/Pages/Admin/Companies/Show.jsx` - Inertia/React admin page: Show.jsx.
- `backend/resources/js/Pages/Admin/Dashboard.jsx` - Inertia/React admin page: Dashboard.jsx.
- `backend/resources/js/Pages/Admin/Devices/Index.jsx` - Inertia/React admin page: Index.jsx.
- `backend/resources/js/Pages/Admin/Devices/Show.jsx` - Inertia/React admin page: Show.jsx.
- `backend/resources/js/Pages/Admin/Invoices/Index.jsx` - Inertia/React admin page: Index.jsx.
- `backend/resources/js/Pages/Admin/Invoices/Show.jsx` - Inertia/React admin page: Show.jsx.
- `backend/resources/js/Pages/Admin/Products/Index.jsx` - Inertia/React admin page: Index.jsx.
- `backend/resources/js/Pages/Admin/Settings/Application.jsx` - Inertia/React admin page: Application.jsx.
- `backend/resources/js/Pages/Admin/Settings/Integration.jsx` - Inertia/React admin page: Integration.jsx.
- `backend/resources/js/Pages/Admin/Users/Create.jsx` - Inertia/React admin page: Create.jsx.
- `backend/resources/js/Pages/Admin/Users/Edit.jsx` - Inertia/React admin page: Edit.jsx.
- `backend/resources/js/Pages/Admin/Users/Index.jsx` - Inertia/React admin page: Index.jsx.
- `backend/resources/js/Pages/Admin/Users/Show.jsx` - Inertia/React admin page: Show.jsx.
- `backend/resources/js/welcome.js` - Laravel Vite JS: welcome.js.
- `backend/resources/views/app.blade.php` - Blade view: app.blade.php.
- `backend/resources/views/mail/plain.blade.php` - Blade view: plain.blade.php.
- `backend/resources/views/pdf/invoice.blade.php` - Blade view: invoice.blade.php.
- `backend/resources/views/vendor/pulse/dashboard.blade.php` - Blade view: dashboard.blade.php.
- `backend/resources/views/welcome.blade.php` - Blade view: welcome.blade.php.
- `backend/routes/admin.php` - Laravel routes: admin.php.
- `backend/routes/api.php` - Laravel routes: api.php.
- `backend/routes/console.php` - Laravel routes: console.php.
- `backend/routes/web.php` - Laravel routes: web.php.
- `backend/scripts/docker-compose.yml` - Ops/aux file: docker-compose.yml.
- `backend/scripts/environment.txt` - Ops/aux file: environment.txt.
- `backend/storage/app/.gitignore` - Git ignore patterns.
- `backend/storage/app/private/.gitignore` - Git ignore patterns.
- `backend/storage/app/public/.gitignore` - Git ignore patterns.
- `backend/storage/framework/.gitignore` - Git ignore patterns.
- `backend/storage/framework/cache/.gitignore` - Git ignore patterns.
- `backend/storage/framework/cache/data/.gitignore` - Git ignore patterns.
- `backend/storage/framework/sessions/.gitignore` - Git ignore patterns.
- `backend/storage/framework/testing/.gitignore` - Git ignore patterns.
- `backend/storage/framework/views/.gitignore` - Git ignore patterns.
- `backend/storage/logs/.gitignore` - Git ignore patterns.
- `backend/tests/Feature/AxisBillingWebhookTest.php` - Automated test: AxisBillingWebhookTest.php.
- `backend/tests/Feature/ExampleTest.php` - Automated test: ExampleTest.php.
- `backend/tests/Feature/InvoiceRequiresSubscriptionTest.php` - Automated test: InvoiceRequiresSubscriptionTest.php.
- `backend/tests/Pest.php` - Automated test: Pest.php.
- `backend/tests/TestCase.php` - Automated test: TestCase.php.
- `backend/tests/Unit/ExampleTest.php` - Automated test: ExampleTest.php.
- `backend/vite.config.js` - Vite config for Laravel admin assets.
- `frontend/.editorconfig` - Frontend tooling config: .editorconfig.
- `frontend/.gitignore` - Frontend tooling config: .gitignore.
- `frontend/.postcssrc.json` - Frontend tooling config: .postcssrc.json.
- `frontend/.prettierrc` - Frontend tooling config: .prettierrc.
- `frontend/.vscode/extensions.json` - VS Code config: extensions.json.
- `frontend/.vscode/launch.json` - VS Code config: launch.json.
- `frontend/.vscode/mcp.json` - VS Code config: mcp.json.
- `frontend/.vscode/tasks.json` - VS Code config: tasks.json.
- `frontend/angular.json` - Angular workspace configuration.
- `frontend/deploy/deploy.sh` - Deployment shell script.
- `frontend/package.json` - Frontend NPM manifest and scripts.
- `frontend/package-lock.json` - (binary) NPM dependency lockfile.
- `frontend/public/favicon.ico` - (binary) Image asset.
- `frontend/public/logo.png` - (binary) Image asset.
- `frontend/README.md` - Frontend readme.
- `frontend/src/app/app.config.server.ts` - Angular TypeScript module: app.config.server.ts.
- `frontend/src/app/app.config.ts` - Angular TypeScript module: app.config.ts.
- `frontend/src/app/app.css` - Frontend project file: frontend/src/app/app.css.
- `frontend/src/app/app.html` - Frontend project file: frontend/src/app/app.html.
- `frontend/src/app/app.routes.server.ts` - Angular TypeScript module: app.routes.server.ts.
- `frontend/src/app/app.routes.ts` - Angular TypeScript module: app.routes.ts.
- `frontend/src/app/app.spec.ts` - Angular unit test spec.
- `frontend/src/app/app.ts` - Angular TypeScript module: app.ts.
- `frontend/src/app/components/fiscalization-dialog/fiscalization-dialog.component.css` - Angular component styles: fiscalization-dialog.component.css.
- `frontend/src/app/components/fiscalization-dialog/fiscalization-dialog.component.html` - Angular component template: fiscalization-dialog.component.html.
- `frontend/src/app/components/fiscalization-dialog/fiscalization-dialog.component.ts` - Angular component class: fiscalization-dialog.component.ts.
- `frontend/src/app/components/global-loader/global-loader.component.css` - Angular component styles: global-loader.component.css.
- `frontend/src/app/components/global-loader/global-loader.component.html` - Angular component template: global-loader.component.html.
- `frontend/src/app/components/global-loader/global-loader.component.ts` - Angular component class: global-loader.component.ts.
- `frontend/src/app/components/google-g-icon/google-g-icon.component.ts` - Angular component class: google-g-icon.component.ts.
- `frontend/src/app/features/auth-callback/auth-callback.component.ts` - Angular component class: auth-callback.component.ts.
- `frontend/src/app/features/company/company.component.css` - Angular component styles: company.component.css.
- `frontend/src/app/features/company/company.component.html` - Angular component template: company.component.html.
- `frontend/src/app/features/company/company.component.ts` - Angular component class: company.component.ts.
- `frontend/src/app/features/company-setup/company-setup.component.css` - Angular component styles: company-setup.component.css.
- `frontend/src/app/features/company-setup/company-setup.component.html` - Angular component template: company-setup.component.html.
- `frontend/src/app/features/company-setup/company-setup.component.ts` - Angular component class: company-setup.component.ts.
- `frontend/src/app/features/dashboard/dashboard.component.css` - Angular component styles: dashboard.component.css.
- `frontend/src/app/features/dashboard/dashboard.component.html` - Angular component template: dashboard.component.html.
- `frontend/src/app/features/dashboard/dashboard.component.ts` - Angular component class: dashboard.component.ts.
- `frontend/src/app/features/fiscal-day/fiscal-day.component.css` - Angular component styles: fiscal-day.component.css.
- `frontend/src/app/features/fiscal-day/fiscal-day.component.html` - Angular component template: fiscal-day.component.html.
- `frontend/src/app/features/fiscal-day/fiscal-day.component.ts` - Angular component class: fiscal-day.component.ts.
- `frontend/src/app/features/fiscal-setup/fiscal-setup.component.css` - Angular component styles: fiscal-setup.component.css.
- `frontend/src/app/features/fiscal-setup/fiscal-setup.component.html` - Angular component template: fiscal-setup.component.html.
- `frontend/src/app/features/fiscal-setup/fiscal-setup.component.ts` - Angular component class: fiscal-setup.component.ts.
- `frontend/src/app/features/guest-invoice/guest-invoice.component.css` - Angular component styles: guest-invoice.component.css.
- `frontend/src/app/features/guest-invoice/guest-invoice.component.html` - Angular component template: guest-invoice.component.html.
- `frontend/src/app/features/guest-invoice/guest-invoice.component.ts` - Angular component class: guest-invoice.component.ts.
- `frontend/src/app/features/hs-codes/hs-codes.component.css` - Angular component styles: hs-codes.component.css.
- `frontend/src/app/features/hs-codes/hs-codes.component.html` - Angular component template: hs-codes.component.html.
- `frontend/src/app/features/hs-codes/hs-codes.component.ts` - Angular component class: hs-codes.component.ts.
- `frontend/src/app/features/invoice/home.component.css` - Angular component styles: home.component.css.
- `frontend/src/app/features/invoice/home.component.html` - Angular component template: home.component.html.
- `frontend/src/app/features/invoice/home.component.ts` - Angular component class: home.component.ts.
- `frontend/src/app/features/invoice/invoice.model.ts` - Angular TypeScript module: invoice.model.ts.
- `frontend/src/app/features/invoice/invoice-builder.component.css` - Angular component styles: invoice-builder.component.css.
- `frontend/src/app/features/invoice/invoice-builder.component.html` - Angular component template: invoice-builder.component.html.
- `frontend/src/app/features/invoice/invoice-builder.component.ts` - Angular component class: invoice-builder.component.ts.
- `frontend/src/app/features/invoice/new-credit-note.component.ts` - Angular component class: new-credit-note.component.ts.
- `frontend/src/app/features/invoice/new-debit-note.component.ts` - Angular component class: new-debit-note.component.ts.
- `frontend/src/app/features/invoice/new-fiscal-invoice.component.ts` - Angular component class: new-fiscal-invoice.component.ts.
- `frontend/src/app/features/invoices/invoices.component.css` - Angular component styles: invoices.component.css.
- `frontend/src/app/features/invoices/invoices.component.html` - Angular component template: invoices.component.html.
- `frontend/src/app/features/invoices/invoices.component.ts` - Angular component class: invoices.component.ts.
- `frontend/src/app/features/login/login.component.css` - Angular component styles: login.component.css.
- `frontend/src/app/features/login/login.component.html` - Angular component template: login.component.html.
- `frontend/src/app/features/login/login.component.ts` - Angular component class: login.component.ts.
- `frontend/src/app/features/reports/reports-by-buyer.component.css` - Angular component styles: reports-by-buyer.component.css.
- `frontend/src/app/features/reports/reports-by-buyer.component.html` - Angular component template: reports-by-buyer.component.html.
- `frontend/src/app/features/reports/reports-by-buyer.component.ts` - Angular component class: reports-by-buyer.component.ts.
- `frontend/src/app/features/reports/reports-by-product.component.css` - Angular component styles: reports-by-product.component.css.
- `frontend/src/app/features/reports/reports-by-product.component.html` - Angular component template: reports-by-product.component.html.
- `frontend/src/app/features/reports/reports-by-product.component.ts` - Angular component class: reports-by-product.component.ts.
- `frontend/src/app/features/reports/reports-sales.component.css` - Angular component styles: reports-sales.component.css.
- `frontend/src/app/features/reports/reports-sales.component.html` - Angular component template: reports-sales.component.html.
- `frontend/src/app/features/reports/reports-sales.component.ts` - Angular component class: reports-sales.component.ts.
- `frontend/src/app/features/reports/reports-shared.css` - Frontend project file: frontend/src/app/features/reports/reports-shared.css.
- `frontend/src/app/features/reports/reports-shell.component.css` - Angular component styles: reports-shell.component.css.
- `frontend/src/app/features/reports/reports-shell.component.html` - Angular component template: reports-shell.component.html.
- `frontend/src/app/features/reports/reports-shell.component.ts` - Angular component class: reports-shell.component.ts.
- `frontend/src/app/features/signup/signup.component.css` - Angular component styles: signup.component.css.
- `frontend/src/app/features/signup/signup.component.html` - Angular component template: signup.component.html.
- `frontend/src/app/features/signup/signup.component.ts` - Angular component class: signup.component.ts.
- `frontend/src/app/guards/auth.guard.ts` - Angular route guard: auth.guard.ts.
- `frontend/src/app/guards/redirect-authed-home.guard.ts` - Angular route guard: redirect-authed-home.guard.ts.
- `frontend/src/app/interceptors/auth-token.interceptor.ts` - Angular HTTP interceptor: auth-token.interceptor.ts.
- `frontend/src/app/interceptors/loading.interceptor.ts` - Angular HTTP interceptor: loading.interceptor.ts.
- `frontend/src/app/interceptors/unauthorized-logout.interceptor.ts` - Angular HTTP interceptor: unauthorized-logout.interceptor.ts.
- `frontend/src/app/layout/app-top-nav/app-top-nav.component.css` - Angular component styles: app-top-nav.component.css.
- `frontend/src/app/layout/app-top-nav/app-top-nav.component.html` - Angular component template: app-top-nav.component.html.
- `frontend/src/app/layout/app-top-nav/app-top-nav.component.ts` - Angular component class: app-top-nav.component.ts.
- `frontend/src/app/layout/footer/footer.component.css` - Angular component styles: footer.component.css.
- `frontend/src/app/layout/footer/footer.component.html` - Angular component template: footer.component.html.
- `frontend/src/app/layout/footer/footer.component.ts` - Angular component class: footer.component.ts.
- `frontend/src/app/layout/guest-layout/guest-layout.component.css` - Angular component styles: guest-layout.component.css.
- `frontend/src/app/layout/guest-layout/guest-layout.component.html` - Angular component template: guest-layout.component.html.
- `frontend/src/app/layout/guest-layout/guest-layout.component.ts` - Angular component class: guest-layout.component.ts.
- `frontend/src/app/layout/header/header.component.css` - Angular component styles: header.component.css.
- `frontend/src/app/layout/header/header.component.html` - Angular component template: header.component.html.
- `frontend/src/app/layout/header/header.component.ts` - Angular component class: header.component.ts.
- `frontend/src/app/layout/sidebar-layout/sidebar-layout.component.css` - Angular component styles: sidebar-layout.component.css.
- `frontend/src/app/layout/sidebar-layout/sidebar-layout.component.html` - Angular component template: sidebar-layout.component.html.
- `frontend/src/app/layout/sidebar-layout/sidebar-layout.component.ts` - Angular component class: sidebar-layout.component.ts.
- `frontend/src/app/pages/about/about.component.css` - Angular component styles: about.component.css.
- `frontend/src/app/pages/about/about.component.html` - Angular component template: about.component.html.
- `frontend/src/app/pages/about/about.component.ts` - Angular component class: about.component.ts.
- `frontend/src/app/pages/billing/billing.component.css` - Angular component styles: billing.component.css.
- `frontend/src/app/pages/billing/billing.component.html` - Angular component template: billing.component.html.
- `frontend/src/app/pages/billing/billing.component.ts` - Angular component class: billing.component.ts.
- `frontend/src/app/pages/billing-history/billing-history.component.css` - Angular component styles: billing-history.component.css.
- `frontend/src/app/pages/billing-history/billing-history.component.html` - Angular component template: billing-history.component.html.
- `frontend/src/app/pages/billing-history/billing-history.component.ts` - Angular component class: billing-history.component.ts.
- `frontend/src/app/pages/buyers/buyers.component.ts` - Angular component class: buyers.component.ts.
- `frontend/src/app/pages/guide/guide.component.css` - Angular component styles: guide.component.css.
- `frontend/src/app/pages/guide/guide.component.html` - Angular component template: guide.component.html.
- `frontend/src/app/pages/guide/guide.component.ts` - Angular component class: guide.component.ts.
- `frontend/src/app/pages/help/help.component.css` - Angular component styles: help.component.css.
- `frontend/src/app/pages/help/help.component.html` - Angular component template: help.component.html.
- `frontend/src/app/pages/help/help.component.ts` - Angular component class: help.component.ts.
- `frontend/src/app/pages/privacy/privacy.component.css` - Angular component styles: privacy.component.css.
- `frontend/src/app/pages/privacy/privacy.component.html` - Angular component template: privacy.component.html.
- `frontend/src/app/pages/privacy/privacy.component.ts` - Angular component class: privacy.component.ts.
- `frontend/src/app/pages/products/products.component.ts` - Angular component class: products.component.ts.
- `frontend/src/app/pages/settings/settings-activation.component.css` - Angular component styles: settings-activation.component.css.
- `frontend/src/app/pages/settings/settings-activation.component.html` - Angular component template: settings-activation.component.html.
- `frontend/src/app/pages/settings/settings-activation.component.ts` - Angular component class: settings-activation.component.ts.
- `frontend/src/app/pages/settings/settings-fiscal-schedule.component.ts` - Angular component class: settings-fiscal-schedule.component.ts.
- `frontend/src/app/pages/settings/settings-shell.component.html` - Angular component template: settings-shell.component.html.
- `frontend/src/app/pages/settings/settings-shell.component.ts` - Angular component class: settings-shell.component.ts.
- `frontend/src/app/pages/settings/settings-taxes.component.ts` - Angular component class: settings-taxes.component.ts.
- `frontend/src/app/pages/settings/settings-units.component.html` - Angular component template: settings-units.component.html.
- `frontend/src/app/pages/settings/settings-units.component.ts` - Angular component class: settings-units.component.ts.
- `frontend/src/app/pages/terms/terms.component.css` - Angular component styles: terms.component.css.
- `frontend/src/app/pages/terms/terms.component.html` - Angular component template: terms.component.html.
- `frontend/src/app/pages/terms/terms.component.ts` - Angular component class: terms.component.ts.
- `frontend/src/app/services/api.service.ts` - Angular injectable service: api.service.ts.
- `frontend/src/app/services/auth-token.service.ts` - Angular injectable service: auth-token.service.ts.
- `frontend/src/app/services/fiscalization-dialog.service.ts` - Angular injectable service: fiscalization-dialog.service.ts.
- `frontend/src/app/services/invoice-pdf.service.ts` - Angular injectable service: invoice-pdf.service.ts.
- `frontend/src/app/services/loading.service.ts` - Angular injectable service: loading.service.ts.
- `frontend/src/app/shared/paged-datatable/paged-datatable.component.css` - Angular component styles: paged-datatable.component.css.
- `frontend/src/app/shared/paged-datatable/paged-datatable.component.html` - Angular component template: paged-datatable.component.html.
- `frontend/src/app/shared/paged-datatable/paged-datatable.component.ts` - Angular component class: paged-datatable.component.ts.
- `frontend/src/app/shared/paged-datatable/paged-datatable.directives.ts` - Angular TypeScript module: paged-datatable.directives.ts.
- `frontend/src/app/theme/axis-aura.preset.ts` - Angular TypeScript module: axis-aura.preset.ts.
- `frontend/src/app/utils/invoice-status.ts` - Angular TypeScript module: invoice-status.ts.
- `frontend/src/app/utils/provinces.ts` - Angular TypeScript module: provinces.ts.
- `frontend/src/app/utils/regions.ts` - Angular TypeScript module: regions.ts.
- `frontend/src/assets/logo.png` - (binary) Image asset.
- `frontend/src/environments/environment.production.ts` - Angular environment (API base URL).
- `frontend/src/environments/environment.ts` - Angular environment (API base URL).
- `frontend/src/index.html` - SPA HTML shell.
- `frontend/src/main.server.ts` - Angular SSR bootstrap.
- `frontend/src/main.ts` - Angular browser bootstrap.
- `frontend/src/server.ts` - Express SSR server entry.
- `frontend/src/styles.css` - Global frontend styles.
- `frontend/tsconfig.app.json` - TypeScript compiler configuration.
- `frontend/tsconfig.json` - TypeScript compiler configuration.
- `frontend/tsconfig.spec.json` - TypeScript compiler configuration.

---

*End of document.*
