# Axis Billing — Technical Documentation

**Source codebase:** `ref-codebases/billing`  
**Documentation generated:** 2026-04-18 (read-only analysis; no repository files were modified.)  
**Purpose:** Describe architecture, payments (EcoCash, ZimSwitch/OPPWA, Omari), data model, configuration, and integration points so the behavior can be re-implemented (for example in Next.js).

**Analysis methodology:** All **application logic, routes, configs, migrations, settings, payment services, tests, and payment-related frontend pages** were read in full. **`composer.lock`** and **`package-lock.json`** are summarized via **`composer.json`** / **`package.json`** rather than line-by-line (they only pin versions). **Binary assets** (PNG/ICO under `public/`) are listed in the manifest with no pixel-level analysis.
//
---

## Section 1 — Project Overview

### What is Axis Billing?

**Axis Billing** is a multi-tenant **subscription and invoicing** web application. Teams manage **customers**, **products**, **plans** (priced subscriptions), **subscriptions**, **invoices**, **payments**, and **exchange rates**. It exposes:

- A **browser UI** (Inertia.js + React) for staff users (per-team tenancy).
- A **JSON API** protected by **API keys** (and optionally session auth) for integrations such as **hosted checkout** (`/pay/{publicId}`), similar in spirit to Stripe Checkout.

At a high level it: creates invoices, records payments against them, transitions invoice/subscription state, sends notifications, optionally posts **webhooks** to other “Axis” apps, and integrates **EcoCash** (mobile money push), **ZimSwitch** via **OPPWA Copy & Pay** (Hyperpay / `oppwa.com`), and **Omari** (vSuite merchant API).

### Intended users

1. **Internal / merchant staff** — authenticated users belonging to a **team** who operate the billing back office (customers, plans, invoices, reports, system configuration).
2. **Integrators / other systems** — backend services that call the **API** with `X-API-Key` to create **checkout sessions** and poll session status.
3. **End customers (payers)** — unauthenticated visitors who open **hosted checkout** URLs and complete payment through EcoCash, card widget, or Omari OTP flows.

### Tech stack

| Layer | Technology |
| --- | --- |
| **Language / runtime** | PHP **^8.3** (platform pin 8.3.30 in `composer.json`) |
| **Framework** | **Laravel ^13** |
| **HTTP server entry** | `public/index.php` → Laravel kernel |
| **Frontend** | **Inertia.js** (`inertiajs/inertia-laravel` + `@inertiajs/react`), **React 19**, **TypeScript**, **Vite 8**, **Mantine UI 8**, **Tailwind CSS 4** |
| **Auth (web)** | Laravel session guard (`routes/web.php` login), password hashing (bcrypt) |
| **API auth** | Custom middleware `AuthenticateWithApiKey` — `X-API-Key` header (`axb_…`), optional session fallback |
| **Database** | Configurable; `.env.example` defaults to **SQLite**; production typically **MySQL/PostgreSQL** via Laravel |
| **Cache / queues** | **Redis** + **Laravel Horizon** (`laravel/horizon`), **Predis** |
| **PDF** | `barryvdh/laravel-dompdf` |
| **Settings in DB** | `spatie/laravel-settings` — gateway and mail credentials can live in `settings` table |
| **Auditing** | `owen-it/laravel-auditing` |
| **API docs** | `dedoc/scramble` (OpenAPI) |
| **Error tracking** | `sentry/sentry-laravel` (optional DSN) |
| **HTTP client** | Laravel `Http` facade (Guzzle underneath) for outbound gateway calls |

**Composer packages (direct, non-dev):** `barryvdh/laravel-dompdf`, `dedoc/scramble`, `inertiajs/inertia-laravel`, `laravel/framework`, `laravel/horizon`, `laravel/tinker`, `laravel/wayfinder`, `mqondisi/laravel-module-generator`, `opcodesio/log-viewer`, `owen-it/laravel-auditing`, `predis/predis`, `sentry/sentry-laravel`, `spatie/laravel-data`, `spatie/laravel-settings`.

**NPM (dependencies):** React, Inertia, Mantine, Tabler icons, Recharts, Vite, Tailwind, etc. (see `package.json`).

### Entry points (incoming requests)

| Entry | Role |
| --- | --- |
| `public/index.php` | Front controller; bootstraps Laravel and passes `Request::capture()` to the application. |
| `routes/web.php` | Browser routes: Inertia pages, login, **public hosted checkout** under `/pay/...`, authenticated billing UI. |
| `routes/api.php` | Stateless JSON API: `/api/health`, **public** `POST /api/ecocash/notify`, and **API-key** routes (`auth.api` + `throttle:billing-api`). |
| `routes/console.php` | Scheduled commands: daily invoice schedule at **08:00** (app timezone), Horizon snapshot every 5 minutes. |
| `artisan` | CLI entry for migrations, Horizon, tests, etc. |

Laravel registers API routes with the **`api` prefix** (so route file paths like `ecocash/notify` are served as **`/api/ecocash/notify`**). Web routes have no prefix unless defined (e.g. `/pay/{publicId}`).

### How configuration works

1. **`.env` / environment variables** — Bootstrap secrets and defaults: `APP_KEY`, `APP_URL`, `DB_*`, `REDIS_*`, gateway env vars (`ECOCASH_*`, `ZIMSWITCH_*`, `OMARI_*`), `AXIS_WEBHOOK_*`, `SENTRY_LARAVEL_DSN`, etc. See **Section 7**.
2. **`config/*.php`** — Laravel config files; notable: `config/ecocash.php`, `config/zimswitch.php`, `config/omari.php`, `config/billing.php`, `config/services.php` (Axis webhooks), `config/app.php` (timezone default `Africa/Harare`).
3. **Database settings (`spatie/laravel-settings`)** — After migrations, **Application**, **Mail**, **EcoCash**, **ZimSwitch**, **Omari**, and other settings are stored in the **`settings`** table and loaded at boot in `AppServiceProvider`:
   - `configureApplicationFromSettings()` overrides `config('app.name|url|debug|timezone')`.
   - `configureGatewayConfigFromSettings()` copies **EcoCash**, **ZimSwitch**, and **Omari** fields into `config('ecocash.*')`, `config('zimswitch.*')`, `config('omari.*')` so existing code using `config()` keeps working.
   - `configureMailFromSettings()` applies SMTP/from addresses to `config('mail.*')`.
4. **System Configuration UI** — Authenticated users edit many of these values via `SystemConfigurationController` (Inertia page `system-configuration/Index`).

**Important:** If the `settings` table is present and settings load successfully, **database values override `.env` for those bridged keys** (gateways, app URL/name/debug/timezone, mail). If settings are missing or throw, **`.env` / config file defaults** apply.

### Full folder and file structure

The repository contains **384 files** under `ref-codebases/billing`. Below, **every path** is listed with a one-line description. Files marked *(binary)* are not text source files; they are static assets.

#### Root & tooling

| File | Description |
| --- | --- |
| `.editorconfig` | Editor indentation/charset defaults for the repo. |
| `.env.example` | Template environment variables and documentation comments. |
| `.gitattributes` | Git attributes (line endings, export ignores, etc.). |
| `.gitignore` | Ignored build artifacts, vendor, env files. |
| `.npmrc` | npm configuration for the project. |
| `.prettierignore` | Paths Prettier should skip. |
| `.prettierrc` | Prettier formatting rules. |
| `artisan` | Laravel command-line entry script. |
| `azure-pipelines.yml` | Azure DevOps pipeline definition. |
| `composer.json` | PHP dependencies, scripts, autoload, platform PHP version. |
| `composer.lock` | Locked dependency versions for reproducible Composer installs. |
| `eslint.config.js` | ESLint flat config for TS/JS. |
| `package.json` | npm scripts and frontend dependencies. |
| `package-lock.json` | Locked npm dependency tree. |
| `phpunit.xml` | PHPUnit/Pest config; testing env (sqlite `:memory:`, sync queue, etc.). |
| `pint.json` | Laravel Pint PHP code style config. |
| `postcss.config.cjs` | PostCSS pipeline (Mantine/Tailwind). |
| `tsconfig.json` | TypeScript compiler options. |
| `vite.config.ts` | Vite bundler config (React, Wayfinder, Tailwind). |

#### `.github/workflows/`

| File | Description |
| --- | --- |
| `lint.yml` | CI workflow to run PHP/NPM linters. |
| `tests.yml` | CI workflow to run automated tests. |

#### `app/Console/Commands/`

| File | Description |
| --- | --- |
| `InvoicesRunDailyScheduleCommand.php` | Artisan command invoked by the scheduler for daily invoice/reminder logic. |

#### `app/DAO/` (data access helpers)

| File | Description |
| --- | --- |
| `CustomerDao.php` | Team-scoped customer queries. |
| `ExchangeRateDao.php` | Exchange rate queries. |
| `InvoiceDao.php` | Invoice listing/detail queries. |
| `InvoiceItemDao.php` | Invoice line item queries. |
| `PaymentDao.php` | Payment queries. |
| `PlanDao.php` | Plan queries with product relation. |
| `ProductDao.php` | Product queries. |
| `SubscriptionDao.php` | Subscription queries. |
| `Interfaces/*.php` | Interfaces for each DAO. |

#### `app/Data/` (DTOs and API input objects)

| File | Description |
| --- | --- |
| `Api/Store*.php`, `Api/Update*.php` | spatie/laravel-data objects for API create/update payloads. |
| `CancelSubscriptionInputData.php` | Input for canceling a subscription. |
| `CreateCheckoutSessionInputData.php` | Input for hosted checkout session creation. |
| `CreateSubscriptionInputData.php` | Input for creating subscriptions. |
| `CustomerDto.php`, `InvoiceDto.php`, … | Typed DTOs for domain entities. |
| `GenerateInvoiceFromSubscriptionInputData.php` | Options when generating invoice from subscription. |
| `RecordPaymentInputData.php` | Input for recording a payment (amount, method, references). |
| `RenewSubscriptionInputData.php` | Renewal input. |
| `TransitionSubscriptionStatusInputData.php` | Manual status transition input. |
| `Concerns/FromValidatedRequest.php` | Shared request → data mapping helpers. |

#### `app/Enums/`

| File | Description |
| --- | --- |
| `BillingInterval.php` | Billing interval enum. |
| `EcocashTransactionStatus.php` | EcoCash transaction lifecycle. |
| `InvoiceGeneratedSource.php` | Whether invoice came from subscription vs manual (for events). |
| `InvoiceStatus.php` | Invoice state machine values. |
| `PaymentPlatform.php` | Known payment platforms (ecocash, zimswitch, omari, …). |
| `PaymentStatus.php` | Payment succeeded/failed/etc. |
| `SubscriptionStatus.php` | Subscription lifecycle. |

#### `app/Events/`

| File | Description |
| --- | --- |
| `InvoiceGenerated.php`, `InvoicePaid.php`, `PaymentCompleted.php` | Billing domain events. |
| `Subscription*.php` | Subscription lifecycle events. |

#### `app/Exceptions/`

| File | Description |
| --- | --- |
| `InvalidSubscriptionTransitionException.php` | Illegal subscription transition. |
| `InvoiceGenerationException.php` | Invoice could not be generated. |
| `PaymentRecordingException.php` | Payment record validation failed. |

#### `app/Filesystem/`

| File | Description |
| --- | --- |
| `Filesystem.php` | Custom filesystem helper binding. |

#### `app/Http/Api/`

| File | Description |
| --- | --- |
| `ApiResponse.php` | Standard JSON success envelope for API controllers. |

#### `app/Http/Controllers/` (web + API)

| File | Description |
| --- | --- |
| `Api/CheckoutSessionController.php` | Create/show hosted checkout sessions via API. |
| `Api/HealthController.php` | Health check endpoint. |
| `Api/PlanController.php`, `ProductController.php`, `SubscriptionController.php` | Read-only or lifecycle API for catalog/subscriptions. |
| `ApiKeyController.php` | Manage API keys (UI). |
| `AuditTrailController.php` | Audit log UI. |
| `Auth/AuthenticatedSessionController.php` | Login/logout. |
| `BillingIntervalConfigController.php` | CRUD custom billing interval labels. |
| `BillingIntervalController.php` | List billing intervals. |
| `Controller.php` | Base controller. |
| `CustomerController.php` | Customer CRUD (Inertia). |
| `DashboardController.php` | Dashboard metrics. |
| `EcoCashController.php` | Initiate EcoCash, webhook notify, poll status (JSON). |
| `ExchangeRateController.php` | Exchange rate CRUD. |
| `InvoiceController.php` | Invoice UI + PDF/HTML document + JSON operations. |
| `InvoiceItemController.php` | Invoice line items. |
| `LegalController.php` | Privacy/terms Inertia pages. |
| `PaymentController.php` | Payments UI + JSON. |
| `PlanController.php`, `ProductController.php` | Plans/products UI. |
| `PublicCheckoutController.php` | Hosted checkout pages and payment flows (EcoCash, ZimSwitch, Omari). |
| `Reports/*ReportController.php` | Revenue, customers, subscriptions, invoices reports. |
| `SubscriptionController.php` | Subscriptions UI. |
| `SystemConfigurationController.php` | Edit application/mail/gateway settings (Inertia). |
| `TeamController.php` | Team info page. |
| `UserController.php` | User management. |
| `WelcomeController.php` | Marketing/landing page. |
| `ZimswitchController.php` | Authenticated ZimSwitch Copy & Pay prepare + status polling. |

#### `app/Http/Middleware/`

| File | Description |
| --- | --- |
| `AuthenticateWithApiKey.php` | Validates `X-API-Key`, sets `tenant_id` and optional product scope. |
| `EnsureUserHasTeam.php` | Ensures logged-in user has `team_id` (`tenant` alias). |
| `HandleInertiaRequests.php` | Shared Inertia props. |

#### `app/Listeners/`

| File | Description |
| --- | --- |
| `FinalizeCheckoutSessionOnPaymentCompleted.php` | Marks checkout session succeeded and creates subscription when payment completes. |
| `LogBillingEvents.php` | Logs billing events. |
| `NotifyTeamBillingEvents.php` | Database notifications to team users. |
| `SendAxisWebhook.php` | Outbound HMAC-signed webhook to `AXIS_WEBHOOK_URL`. |
| `SendPaymentSuccessNotificationEmails.php` | Sends email on successful payment (when configured). |

#### `app/Mail/`

| File | Description |
| --- | --- |
| `InvoiceOverdueReminderMail.php` | Overdue invoice reminder email. |
| `PaymentSucceededMail.php` | Payment success email. |

#### `app/Models/`

| File | Description |
| --- | --- |
| `ApiKey.php` | API key storage and verification (hashed secret). |
| `Audit.php` | Auditing model (package). |
| `BillingIntervalConfig.php` | Configurable interval definitions per team. |
| `CheckoutSession.php` | Hosted checkout session state. |
| `Customer.php` | Customer. |
| `EcocashTransaction.php` | EcoCash attempt/notification state. |
| `ExchangeRate.php` | FX rate per currency per team. |
| `Invoice.php`, `InvoiceItem.php` | Invoice header and lines. |
| `Payment.php` | Payment rows (amount stored in USD with optional original currency columns). |
| `Plan.php`, `Product.php` | Catalog. |
| `Subscription.php` | Subscription. |
| `Team.php`, `User.php` | Tenancy and staff users. |
| `Concerns/AuditableTeamScoped.php` | Audit + team scope behavior. |
| `Concerns/HasTeamScope.php` | Global scope using `request()->attributes->tenant_id`. |

#### `app/Notifications/`

| File | Description |
| --- | --- |
| `BillingNotification.php` | In-app database notification payload. |

#### `app/Providers/`

| File | Description |
| --- | --- |
| `AppServiceProvider.php` | Singletons, rate limiting, **settings → config** bridging. |
| `EventServiceProvider.php` | Event/listener map. |
| `HorizonServiceProvider.php` | Horizon dashboard authorization. |
| `RepositoryServiceProvider.php` | Binds repository interfaces. |

#### `app/Repositories/` + `Interfaces/`

| File | Description |
| --- | --- |
| `*Repository.php` | Eloquent-backed repositories for domain aggregates. |

#### `app/Services/`

| File | Description |
| --- | --- |
| `ApiKeyService.php` | API key creation/revocation. |
| `AuditService.php` | Audit helpers. |
| `BillingIntervalConfigService.php` | Interval config logic. |
| `CheckoutSessionService.php` | Creates checkout sessions and subscriptions after payment. |
| `CustomerService.php` | Customer operations. |
| `DashboardService.php` | Dashboard aggregates. |
| `EcoCashService.php` | **EcoCash HTTP integration + webhook handling.** |
| `ExceptionReporter.php` | Central exception reporting hook. |
| `ExchangeRateService.php` | FX conversion; **USD is the stored base for payments.** |
| `InvoiceItemService.php` | Line items. |
| `InvoiceScheduleService.php` | Scheduled invoice generation/reminders. |
| `InvoiceService.php` | Invoice creation, totals, events. |
| `OmariService.php` | **Omari vSuite HTTP API client.** |
| `PaymentService.php` | **Records payments**, enforces balances, dispatches events. |
| `PlanService.php`, `ProductService.php` | Catalog services with cache invalidation. |
| `Reports/*.php` | Report builders. |
| `SubscriptionService.php` | Subscription lifecycle. |
| `UserService.php` | User administration. |
| `ZimswitchCopyPayService.php` | **OPPWA checkout create + payment status fetch.** |
| `ZimswitchPaymentStatusMapper.php` | Maps OPPWA result codes to success/pending/rejected. |

#### `app/Settings/` + `Casts/`

| File | Description |
| --- | --- |
| `ApplicationSettings.php` | DB-backed app name, URL, debug, timezone. |
| `EcoCashSettings.php` | DB-backed EcoCash credentials and URLs. |
| `MailSettings.php` | DB-backed SMTP settings. |
| `OmariSettings.php` | DB-backed Omari config. |
| `PaymentNotificationSettings.php` | Who receives payment success emails. |
| `ZimswitchSettings.php` | DB-backed OPPWA token, base URL, payment options map. |
| `Casts/AssocArrayCast.php` | Cast for associative arrays in settings. |

#### `app/Support/`

| File | Description |
| --- | --- |
| `ApiValidationRules.php` | Shared API validation rules. |
| `BillingCacheKeys.php` | Cache key helpers. |
| `BillingValidationRules.php` | Shared billing validation. |
| `InvoiceDocumentBranding.php` | Logo/data-uri and issuer lines for invoice PDF/HTML. |
| `ReportsByMonth.php` | Reporting helper. |

#### `bootstrap/`

| File | Description |
| --- | --- |
| `app.php` | Laravel application builder: routes, middleware aliases (`tenant`, `auth.api`), Sentry exception handling. |
| `providers.php` | Service provider list. |
| `cache/.gitignore` | Ignore bootstrap cache files. |

#### `config/`

| File | Description |
| --- | --- |
| `app.php` | Application name, env, URL, timezone (`Africa/Harare` default). |
| `audit.php` | Auditing package configuration. |
| `auth.php` | Guards and providers. |
| `billing.php` | Cache TTL, API rate limit, invoice PDF branding text. |
| `cache.php` | Cache stores. |
| `database.php` | DB connections. |
| `ecocash.php` | EcoCash env-backed defaults (overridden by settings when loaded). |
| `filesystems.php` | Disks. |
| `horizon.php` | Queue worker dashboard and Redis queues. |
| `inertia.php` | Inertia middleware / SSR options. |
| `logging.php` | Log channels including **`ecocash`**, **`zimswitch`**, **`omari`**, **`payments`**. |
| `log-viewer.php` | Log viewer package config. |
| `mail.php` | Mailers (overridden from settings when loaded). |
| `omari.php` | Omari base URLs and API key env. |
| `queue.php` | Queue connections. |
| `scramble.php` | OpenAPI docs generation. |
| `sentry.php` | Sentry SDK options. |
| `services.php` | Third-party services including **Axis webhook** env keys. |
| `session.php` | Session driver (database in `.env.example`). |
| `settings.php` | Spatie settings package config. |
| `zimswitch.php` | OPPWA defaults and **embedded payment option entity IDs** for hosted checkout. |

#### `database/factories/`

| File | Description |
| --- | --- |
| `*Factory.php` | Model factories for tests (`Customer`, `Invoice`, `Payment`, `User`, etc.). |

#### `database/migrations/`

| File | Description |
| --- | --- |
| Laravel default `users`, `cache`, `jobs` migrations. |
| Domain migrations for `teams`, `customers`, `products`, `plans`, `subscriptions`, `invoices`, `invoice_items`, `payments`, `exchange_rates`, `ecocash_transactions`, `api_keys`, `api_key_products`, `checkout_sessions`, `settings`, indexes, `trial_days`, etc. |

#### `database/seeders/`

| File | Description |
| --- | --- |
| `DatabaseSeeder.php` | Default seed entry. |
| `LargeDatasetSeeder.php` | Bulk data for performance/testing. |

#### `database/settings/`

| File | Description |
| --- | --- |
| `2026_04_07_171455_create_payment_gateway_settings.php` | Seeds EcoCash, ZimSwitch, Omari settings from env defaults. |
| `2026_04_08_120000_add_mail_and_payment_notification_settings.php` | Mail + notification settings migration. |
| `2026_04_08_130000_add_application_settings.php` | Application settings migration. |

#### `public/`

| File | Description |
| --- | --- |
| `index.php` | Public front controller. |
| `.htaccess` | Apache rewrite rules. |
| `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` | *(binary)* Favicons. |
| `logo.png` | *(binary)* Default invoice logo. |
| `images/axis-logo.svg` | Axis logo asset. |
| `payment-platform-logos/*.png` | *(binary)* Logos for EcoCash, Omari, ZimSwitch, Innbucks. |
| `robots.txt` | Crawler rules. |

#### `resources/css/`

| File | Description |
| --- | --- |
| `app.css` | Global CSS entry (Tailwind/Mantine layers). |

#### `resources/data/zimswitch/`

| File | Description |
| --- | --- |
| `copy_and_pay_result_codes.json` | Bundled OPPWA result code descriptions (**currently empty `resultCodes` array** in repo). |

#### `resources/js/`

| File | Description |
| --- | --- |
| `app.tsx` | Inertia app mount + providers. |
| `theme.ts` | Mantine theme. |
| `providers/AppProviders.tsx` | Mantine/notifications providers. |
| `lib/api.ts` | Frontend API helpers if any. |
| `components/**` | Reusable UI (tables, layout chrome). |
| `layouts/*.tsx` | App shell, auth, landing, payments layout. |
| `pages/**` | Inertia pages: dashboard, CRUD screens, **public-checkout** (Show, EcoCash, EcoCashWait, ZimswitchWidget, Omari, Complete), reports, system configuration, legal. |
| `types/**` | TS types and env declarations. |

#### `resources/views/`

| File | Description |
| --- | --- |
| `app.blade.php` | Root HTML shell for Inertia. |
| `invoices/document.blade.php` | Printable invoice HTML (also used for PDF). |
| `mail/*.blade.php` | Email templates. |

#### `routes/`

| File | Description |
| --- | --- |
| `web.php` | Browser and public checkout routes. |
| `api.php` | JSON API + EcoCash notify. |
| `console.php` | Scheduler definitions. |

#### `scripts/`

| File | Description |
| --- | --- |
| `setup-horizon-supervisor.sh` | Server script for Horizon under supervisor. |
| `supervisor/laravel-horizon.conf.template` | Supervisor config template. |

#### `storage/*/.gitignore` | Ignore patterns for logs, framework cache, uploads. |

#### `tests/`

| File | Description |
| --- | --- |
| `Pest.php`, `TestCase.php` | Test harness. |
| `Support/billing.php` | Shared fixtures (`billingFixture()`). |
| `Feature/**` | HTTP and integration tests (API, EcoCash, ZimSwitch, web, Horizon). |
| `Unit/**` | Unit tests for mappers, filesystem, etc. |

---

## Section 2 — Database Structure

Unless noted, **amounts on `invoices` and `plans` are in the invoice/plan currency** (often `USD`). **`payments.amount` is stored in USD** (see `PaymentService`); original currency amounts may be stored in `original_amount` / `exchange_rate` when paying in non-USD.

### `users`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `name` | string | no | Display name. |
| `email` | string | no | Unique login identifier. |
| `email_verified_at` | timestamp | yes | Email verification time. |
| `password` | string | no | Hashed password. |
| `remember_token` | string | yes | “Remember me” token. |
| `team_id` | FK → `teams.id` | yes | Owning team; `null` is invalid for app usage in most routes. |
| `created_at`, `updated_at` | timestamps | yes | Laravel timestamps. |

**Keys:** PK `id`; unique `email`; FK `team_id` → `teams` (nullOnDelete in migration).  
**Represents:** Staff user accounts for the billing UI.

### `teams`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key (tenant id). |
| `name` | string | no | Team name. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Represents:** **Tenant** — all customers, catalog, invoices, and keys are scoped to a team.

### `customers`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `name` | string | no | Customer name. |
| `email` | string | yes | Added in migration `2026_04_01_120000_*`. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Keys:** FK `team_id` → `teams` cascade on delete.  
**Represents:** End customer entity billed by the team.

### `products`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `name` | string | no | Product name. |
| `description` | text | yes | Optional description. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Represents:** Sellable product grouping for plans.

### `plans`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `product_id` | FK | no | Parent product. |
| `name` | string | no | Plan name. |
| `billing_interval` | string | no | Interval key (e.g. monthly). |
| `price` | decimal(12,2) | no | Price. |
| `currency` | char(3) | no | ISO currency code. |
| `trial_days` | unsigned smallint | yes | Optional trial length (days). |
| `payment_platforms` | json | no | Allowed payment methods for hosted checkout (strings like `ecocash`, `zimswitch`, `omari`). |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Represents:** A priced offer for a product (subscription SKU).

### `subscriptions`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `customer_id` | FK | no | Subscriber. |
| `plan_id` | FK | no | Plan. |
| `status` | string | no | Subscription status enum string. |
| `start_date` | date | no | Start. |
| `end_date` | date | yes | End (if terminated). |
| `trial_end` | timestamp | yes | Trial end. |
| `payment_platform` | string | yes | Last known payment channel. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Indexes:** `(team_id, status)`, `(team_id, end_date)`.  
**Represents:** A customer’s subscription instance.

### `invoices`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `customer_id` | FK | no | Billed customer. |
| `subscription_id` | FK | yes | Related subscription when applicable. |
| `checkout_session_id` | FK → `checkout_sessions` | yes | Hosted checkout linkage. |
| `amount` | decimal(12,2) | no | Total invoice amount in `currency`. |
| `currency` | char(3) | no | Invoice currency. |
| `status` | string | no | Invoice status (`open`, `paid`, etc.). |
| `due_date` | date | no | Due date. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Indexes:** `(team_id, status)`, `(team_id, due_date)`, `(team_id, checkout_session_id)`.  
**Represents:** Money owed by a customer; target for payments.

### `invoice_items`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `invoice_id` | FK | no | Parent invoice. |
| `description` | text | no | Line description. |
| `quantity` | unsigned int | no | Quantity. |
| `unit_price` | decimal(12,2) | no | Unit price. |
| `total` | decimal(12,2) | no | Line total. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Index:** `(team_id, invoice_id)`.  
**Represents:** Invoice line breakdown (PDF may synthesize a line if none exist).

### `payments`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `invoice_id` | FK | no | Invoice paid. |
| `amount` | decimal(12,2) | no | **Amount in USD** after conversion (see `PaymentService`). |
| `currency` | string | no | **Accounting currency** — defaults `USD` (`migration`). |
| `original_amount` | decimal(18,6) | yes | Amount in `paid_currency` if non-USD. |
| `exchange_rate` | decimal(18,6) | yes | Snapshot of FX used. |
| `payment_method` | string | no | e.g. `ecocash`, `zimswitch`, `omari`, `cash`. |
| `status` | string | no | `PaymentStatus` string value. |
| `transaction_reference` | string | yes | Gateway reference (EcoCash reference code, OPPWA checkout id, etc.). |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Indexes:** `(team_id, transaction_reference)`, `(team_id, status)`.  
**Represents:** A payment attempt or success against an invoice.

### `exchange_rates`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `currency` | string | no | Non-USD code (e.g. `ZWG`). |
| `rate` | decimal(18,6) | no | **Units of local currency per 1 USD** (see `ExchangeRateService` docblock). |
| `effective_date` | date | no | Rate validity date. |
| `notes` | text | yes | Optional notes. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Index:** `(team_id, currency, effective_date)`.  
**Represents:** FX table for converting **USD ↔ local** for EcoCash and reporting.

### `ecocash_transactions`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `invoice_id` | FK | no | Invoice being paid. |
| `client_correlator` | string | no | **Unique** UUID-like id sent to EcoCash. |
| `reference_code` | string | no | **Unique** merchant reference (`AXIS` + timestamp ms). |
| `phone_number` | string | no | MSISDN debited. |
| `local_amount` | decimal(15,2) | no | Amount in local currency charged. |
| `local_currency` | string | no | e.g. `ZWG` or `USD`. |
| `status` | string | no | pending/completed/failed (enum). |
| `ecocash_response` | json | yes | Latest gateway payload snapshot. |
| `payment_id` | FK | yes | Linked payment when succeeded. |
| `completed_at` | timestamp | yes | When marked complete. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Uniques:** `client_correlator`, `reference_code`. **Index:** `(team_id, status)`.  
**Represents:** One EcoCash debit attempt and webhook correlation.

### `api_keys`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `name` | string | no | Human label. |
| `key_prefix` | string(16) | no | First 12 chars for lookup (`axb_` + prefix). |
| `key_hash` | string(64) | no | SHA-256 of full key. |
| `last_used_at` | timestamp | yes | Last successful use. |
| `expires_at` | timestamp | yes | Optional expiry. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Represents:** Programmatic API access for integrators.

### `api_key_products`

Pivot restricting an API key to specific products.

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `api_key_id` | FK | no | API key. |
| `product_id` | FK | no | Allowed product. |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Unique:** `(api_key_id, product_id)`.  
**Represents:** Product-level API key scoping.

### `checkout_sessions`

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `team_id` | FK | no | Owning team. |
| `plan_id` | FK | no | Plan being purchased. |
| `customer_id` | FK | no | Customer for this checkout. |
| `invoice_id` | FK | no | Invoice created for this session. |
| `public_id` | uuid | no | **Unique** token for `/pay/{publicId}`. |
| `callback_url` | text | no | Merchant redirect after completion. |
| `external_reference` | string | yes | Integrator reference. |
| `payment_platform` | string | yes | Selected channel (`ecocash`, `zimswitch`, `omari`, `free`, …). |
| `provider_checkout_id` | string | yes | OPPWA checkout id or Omari debit ref. |
| `provider_reference` | string | yes | EcoCash reference code or ZimSwitch **option key**. |
| `status` | string | no | `open`, `processing`, `succeeded`, `failed`, etc. |
| `completed_at` | timestamp | yes | Completion time. |
| `subscription_id` | FK | yes | Created subscription after success. |
| `payment_id` | FK | yes | Final payment row. |
| `metadata` | json | yes | Extra data (includes ZimSwitch status snapshots). |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Indexes:** `(team_id, status)`, `(team_id, plan_id)`.  
**Represents:** Hosted checkout lifecycle.

### `billing_interval_configs`

Configurable labels for billing intervals per team (seeded with one-time/monthly/yearly).

### `settings` (Spatie)

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | bigint | no | Primary key. |
| `group` | string | no | Settings group (`ecocash`, `zimswitch`, …). |
| `name` | string | no | Setting name within group. |
| `payload` | json | no | Value payload. |
| `locked` | boolean | no | Prevent edits when true (migration added). |
| `created_at`, `updated_at` | timestamps | yes | Timestamps. |

**Unique:** `(group, name)`.  
**Represents:** DB-backed configuration for gateways and application metadata.

### Other tables

- **`cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`** — Laravel infrastructure.
- **`sessions`** — Database session driver storage.
- **`password_reset_tokens`** — Password resets.
- **`notifications`** — Laravel notifications table.
- **`audits`** — Audit log rows (package + `team_id` column).

---

## Section 3 — EcoCash Payment Integration

### Files that touch EcoCash (representative list)

| Path | Role |
| --- | --- |
| `app/Services/EcoCashService.php` | **Core integration:** HTTP POST to EcoCash, build JSON payload, persist `EcocashTransaction`, handle `/api/ecocash/notify` webhook, record payment on success. |
| `app/Http/Controllers/EcoCashController.php` | Routes: `POST ecocash/initiate`, `POST api/ecocash/notify`, `GET ecocash/status/{referenceCode}`. |
| `app/Http/Controllers/PublicCheckoutController.php` | Hosted checkout: `startEcocash`, `ecocashWait`, uses `EcoCashService::initiatePayment`. |
| `config/ecocash.php` | Env → config keys. |
| `app/Settings/EcoCashSettings.php` | DB-backed settings mirrored into `config('ecocash')`. |
| `app/Models/EcocashTransaction.php` | Eloquent model for transaction rows. |
| `database/migrations/*_create_ecocash_transactions_table.php` | Schema. |
| `resources/js/pages/public-checkout/EcoCash.tsx`, `EcoCashWait.tsx` | Customer UI and **polling** behavior. |
| `tests/Feature/EcoCashFlowTest.php`, `EcoCashNotifyTest.php` | Automated tests with `Http::fake`. |

Search hits also occur in enums, notifications, mail copy, invoice branding text, plan `payment_platforms` JSON, etc.

### End-to-end flow (plain English)

#### A) Staff-initiated flow (`POST /ecocash/initiate` — authenticated)

1. User picks an **invoice** and submits **phone number** (+ optional **currency**).
2. `EcoCashService::initiatePayment` computes **local currency amount** from the invoice: invoice amounts are interpreted as **USD** in the conversion path; the service calls `ExchangeRateService::convertFromUsd` to get ZWG (or chosen currency) using the team’s latest rate.
3. It builds a **JSON body** (see below) including `notifyUrl` pointing at **`{APP_URL}/api/ecocash/notify`** (must be reachable by EcoCash servers).
4. It sends **HTTP POST** to `config('ecocash.api_url')` with **HTTP Basic Auth** (`ECOCASH_USERNAME` / `ECOCASH_PASSWORD`).
5. It **always** inserts an `ecocash_transactions` row (`Pending`) storing `client_correlator`, `reference_code`, phone, amounts, and raw JSON response.
6. If HTTP response is not successful, it throws; controller returns **422** with message.
7. If success, JSON returns `reference_code`, correlator, local amount/currency, and raw `transactionOperationStatus` from EcoCash.

**USSD / phone prompt:** The code comments describe this as a **“debit push”** to the phone. The actual USSD push is triggered **by EcoCash’s gateway** when it accepts the API request — this codebase does not send SMS/USSD itself; it relies on EcoCash honoring `endUserId` and merchant fields.

#### B) Hosted checkout flow (`/pay/{publicId}/ecocash`)

1. Customer submits phone + **currency** `USD` or `ZWG` on the EcoCash form.
2. `startEcocash` calls the same `initiatePayment`, sets checkout session to `processing`, stores EcoCash **reference** in `provider_reference`, redirects to **wait** page.

#### C) Webhook (`POST /api/ecocash/notify`)

1. EcoCash POSTs JSON to **`/api/ecocash/notify`** (no API key; **no CSRF** — API routes).
2. `handleNotification` finds `EcocashTransaction` by **`clientCorrelator`** or **`referenceCode`** (without team scope).
3. It merges payload into `ecocash_response`.
4. If still `Pending`, it classifies:
   - **Success** if `transactionOperationStatus` is one of `CHARGED`, `COMPLETED`, `SUCCESS`, `SUCCEEDED` **or** `ecocashResponseCode === SUCCEEDED`.
   - **Failure** if status is `DELIVERYIMPOSSIBLE`, `CANCELLED`, `FAILED` or response code `FAILED`.
5. On success it sets `tenant_id` on the request and calls `PaymentService::recordPayment` with USD amount from **`convertToUsd(local_amount, local_currency)`**, method `ecocash`, reference = `reference_code`.
6. On failure it may mark checkout session **failed** and notify team users.

**Verification:** The application **does not verify an HMAC or signature** on EcoCash callbacks in code — **any caller who can reach `/api/ecocash/notify` can post payloads**. Operational security must rely on **network controls**, **EcoCash source IP allowlisting** (not implemented in code), or **gateway-side authentication** if provided by the operator (not present here).

### Outbound EcoCash API call

**Full URL (from `.env.example`):**

`https://payonline.ecocashholdings.co.zw/ecocashGateway/payment/v1/transactions/amount`

(Overridable via `ECOCASH_API_URL` / settings.)

| Property | Value |
| --- | --- |
| **HTTP method** | `POST` |
| **Auth** | **Basic Auth** — username `ECOCASH_USERNAME`, password `ECOCASH_PASSWORD` |
| **Headers** | `Content-Type: application/json`, `Accept: application/json` |
| **Body format** | **JSON object** |

#### Request body (fields produced in code)

The payload is built in `EcoCashService::buildPayload`:

```php
// Simplified from app/Services/EcoCashService.php — illustrates all keys sent
[
    'clientCorrelator' => '<uuid>',
    'notifyUrl' => '<absolute URL to /api/ecocash/notify>',
    'referenceCode' => 'AXIS<milliseconds>',
    'tranType' => 'MER',
    'endUserId' => '<phone number>',
    'remarks' => 'AXIS BILLING ONLINE PAYMENT',
    'transactionOperationStatus' => 'Charged',
    'paymentAmount' => [
        'charginginformation' => [
            'amount' => <float local amount>,
            'currency' => '<ZWG or USD etc.>',
            'description' => 'Axis Billing Invoice Payment',
        ],
        'chargeMetaData' => [
            'channel' => 'WEB',
            'purchaseCategoryCode' => 'Online Payment',
            'onBeHalfOf' => 'Axis Billing',
        ],
    ],
    'merchantCode' => '<ECOCASH_MERCHANT_CODE>',
    'merchantPin' => '<ECOCASH_MERCHANT_PIN>',
    'merchantNumber' => '<same as phone in this integration>',
    'currencyCode' => '<currency>',
    'countryCode' => 'ZW',
    'terminalID' => '<ECOCASH_TERMINAL_ID>',
    'location' => '<ECOCASH_LOCATION>',
    'superMerchantName' => '<ECOCASH_SUPER_MERCHANT>',
    'merchantName' => '<ECOCASH_MERCHANT_NAME>',
]
```

**Field meanings:**

| Field | Meaning | Example | Required |
| --- | --- | --- | --- |
| `clientCorrelator` | Idempotency / correlation id (UUID) | `550e8400-e29b-41d4-a716-446655440000` | Yes (generated) |
| `notifyUrl` | Server-to-server callback URL | `https://billing.example.com/api/ecocash/notify` | Yes |
| `referenceCode` | Merchant reference shown in reports | `AXIS1713456789000` | Yes |
| `tranType` | Transaction type | `MER` | Yes |
| `endUserId` | Customer MSISDN | `0777123456` | Yes |
| `remarks` | Narrative | Fixed string | Yes |
| `transactionOperationStatus` | Requested operation status label | `Charged` | Yes |
| `paymentAmount.*` | Amount + metadata | See above | Yes |
| `merchantCode`, `merchantPin` | Merchant credentials | From env/settings | Yes |
| `merchantNumber` | Set equal to **phone** in this code | Same as `endUserId` | Present |
| `currencyCode` | Currency | `ZWG` | Yes |
| `countryCode` | Country | `ZW` | Yes |
| `terminalID` | Terminal / POS id string | `REVPOS-ECO` | Yes |
| `location`, `superMerchantName`, `merchantName` | Display / registration metadata | Harare, company names | Yes |

**Ambiguity:** `merchantNumber` equals the customer phone in this codebase — confirm with EcoCash documentation whether this should be the **merchant MSISDN** instead; the code assumes the gateway’s expected shape from prior integration notes.

### Success and failure responses (immediate HTTP response)

The service uses `$response->json()` and checks `$response->successful()`.

- **On transport/HTTP failure:** Exception message uses `$data['message']` if present, else `"EcoCash returned HTTP {status}"`.
- **Documented success fields used:** `transactionOperationStatus` (returned to client as `ecocash_status`).
- **The codebase does not enumerate EcoCash-specific error codes** in PHP — failures are logged with full body to the **`ecocash` log channel**.

**Webhook payload** (incoming): Uses `clientCorrelator`, `referenceCode`, `transactionOperationStatus`, `ecocashResponseCode`, nested `paymentAmount` (see test `EcoCashNotifyTest` for example). Sensitive keys like `merchantPin` are redacted in logs.

### Callback URL (inbound to this app)

| Item | Value |
| --- | --- |
| **Route** | `POST /api/ecocash/notify` |
| **Full URL** | `{APP_URL}/api/ecocash/notify` — also seeded as `ECOCASH_NOTIFY_URL` |
| **Auth** | **None** in code |
| **Response** | Always `200` JSON `{ "status": "ok" }` after processing (even if transaction unknown). |

### Polling

| Mechanism | Interval | Endpoint |
| --- | --- | --- |
| **Browser (hosted wait page)** | **5 seconds** | `GET /pay/{publicId}/status` — JSON includes `paid` / `status` |
| **Staff JSON API** | On demand | `GET /ecocash/status/{referenceCode}` (authenticated) returns DB transaction state |

There is **no server-side job** polling EcoCash’s gateway for status — reliance is on **notify webhook** + **client polling** of local DB state.

### Credentials and configuration

| Secret / id | Env / settings key | Purpose |
| --- | --- | --- |
| Basic auth user | `ECOCASH_USERNAME` | HTTP Basic user |
| Basic auth password | `ECOCASH_PASSWORD` | HTTP Basic password |
| Merchant code | `ECOCASH_MERCHANT_CODE` | `merchantCode` |
| Merchant PIN | `ECOCASH_MERCHANT_PIN` | `merchantPin` |
| Terminal | `ECOCASH_TERMINAL_ID` | `terminalID` |
| Location / names | `ECOCASH_LOCATION`, `ECOCASH_SUPER_MERCHANT`, `ECOCASH_MERCHANT_NAME` | Metadata |
| API URL | `ECOCASH_API_URL` | Gateway endpoint |
| Notify URL | `ECOCASH_NOTIFY_URL` | Must be publicly reachable HTTPS in production |
| Default currency | `ECOCASH_CURRENCY` | Default local currency (e.g. `ZWG`) |

**How to obtain:** Through **EcoCash / EcoCash Holdings merchant onboarding** and their developer/merchant portal (not documented in-repo).

### Test vs live

- **Sandbox URL / flag:** Not implemented as a dedicated `ECOCASH_SANDBOX` toggle — operators typically **point `ECOCASH_API_URL`** at a test endpoint provided by the acquirer or use **test credentials** in settings.
- Switching environments = **change URL + credentials** in System Configuration or `.env`.

### Currency handling

- Invoice amounts for conversion are treated as **USD** in `initiatePayment` via `convertFromUsd` / `convertToUsd`.
- EcoCash charge uses **decimal amount in local currency** (e.g. ZWG dollars, not cents) as a **float** in JSON — **not** minor units.
- Hosted checkout allows **`USD` or `ZWG`** selection; staff initiate flow defaults currency from config if omitted.

---

## Section 4 — ZimSwitch / Card Payment Integration (OPPWA Copy & Pay)

ZimSwitch card flows use **OPPWA** (Hyperpay) **Copy & Pay**: server creates a **checkout** resource; the browser loads **`paymentWidgets.js`**; the customer enters card/wallet details; OPPWA redirects back to **`returnUrl`** with `?id={checkoutId}`; the app queries **`GET /v1/checkouts/{id}/payment`** to learn the result.

### Key files

| Path | Role |
| --- | --- |
| `app/Services/ZimswitchCopyPayService.php` | `createCheckout`, `fetchPaymentStatus` — outbound OPPWA HTTP. |
| `app/Services/ZimswitchPaymentStatusMapper.php` | Regex classification of OPPWA `result.code` values (success, pending, 3DS-related rejects, etc.). |
| `app/Http/Controllers/ZimswitchController.php` | Authenticated back-office flow: `prepare` + `status` with **Cache** binding checkout→invoice. |
| `app/Http/Controllers/PublicCheckoutController.php` | Hosted checkout: `startZimswitch`, `zimswitchWidget`, `zimswitchReturn`. |
| `config/zimswitch.php` | Default `base_url`, token env, **payment_options** (entity id + `data-brands`), timeouts. |
| `app/Settings/ZimswitchSettings.php` | DB-backed overrides including **payment_options** JSON. |
| `resources/js/pages/public-checkout/ZimswitchWidget.tsx` | Loads widget script, renders OPPWA `<form class="paymentWidgets">`. |
| `resources/data/zimswitch/copy_and_pay_result_codes.json` | Intended for human-readable code descriptions (**empty in repo**). |

### Authenticated flow (`ZimswitchController`)

1. **`POST /zimswitch/checkout`** with `invoice_id` (+ optional `payment_type`).
2. Requires `config('zimswitch.entity_id')` — **this key is not defined in `config/zimswitch.php`**. Tests inject `zimswitch.entity_id`. In production, **unless** you add `entity_id` to config or settings bridging, **`prepare` returns 503** (“entity id is not configured”). **Hosted checkout does not use this path** — it uses **`payment_options[*].entity_id`** instead.

3. Computes **remaining balance** in invoice currency from succeeded payments.
4. Calls OPPWA:

`POST {ZIMSWITCH_BASE_URL}/v1/checkouts?entityId=...&amount=...&currency=...&paymentType=...`

5. Caches invoice/amount/currency keyed by `zimswitch:checkout:{teamId}:{sha1(checkoutId)}`.
6. Returns `checkout_id` + `entity_id` to the frontend (entity from config).
7. **`GET /zimswitch/checkout/{checkoutId}/status?invoice_id=`** polls OPPWA payment endpoint; on success records payment **idempotently** by `transaction_reference = checkoutId`.

### Hosted checkout flow (`PublicCheckoutController`)

1. Customer picks a **payment option key** (`visa_master_usd`, `zimswitch_usd`, `zimswitch_zig`, etc.) from `config('zimswitch.payment_options')` / DB settings.
2. `startZimswitch` validates option, reads **`entity_id`** and **`data_brands`** for that option.
3. Calls `createCheckout` with **full invoice amount** and invoice **currency**.
4. Stores OPPWA checkout id in `checkout_sessions.provider_checkout_id`, option key in `provider_reference`, metadata JSON.
5. **`zimswitchWidget`** renders React page with:

   - **Script URL:** `{baseUrl}/v1/paymentWidgets.js?checkoutId={checkoutId}`
   - **Form:** `<form action={returnUrl} className="paymentWidgets" data-brands={dataBrands} />`  
     `returnUrl` = `GET /pay/{publicId}/zimswitch/return`.

6. Browser executes OPPWA script — **redirect / 3DS** behavior is **inside OPPWA** (not in this repo).

7. **`zimswitchReturn`** reads `id` query param (checkout id), fetches payment status, on success calls `PaymentService::recordPayment` with **invoice amount** converted to USD if needed, `transaction_reference = checkoutId`.

### Outbound OPPWA HTTP calls

**Base URL (default):** `https://eu-prod.oppwa.com` (`ZIMSWITCH_BASE_URL`).

| Step | Method | URL pattern | Auth |
| --- | --- | --- | --- |
| Create checkout | `POST` | `{base}/v1/checkouts?entityId={entityId}&amount={amount}&currency={currency}&paymentType={paymentType}` | `Authorization: Bearer {ZIMSWITCH_AUTHORIZATION_TOKEN}` |
| Payment status | `GET` | `{base}/v1/checkouts/{checkoutId}/payment?entityId={entityId}` | Same bearer token |

Optional header: `testMode: {ZIMSWITCH_TEST_MODE}` when env is non-empty (sandbox/internal testing per OPPWA docs).

**Amount format:** `number_format` to **2 decimal places** string in query (e.g. `10.00`).

### Redirect and return

- **Return URL:** Application route  
  `GET https://{app host}/pay/{publicId}/zimswitch/return`  
  OPPWA appends **`?id={checkoutId}`** (see controller).
- **Verification:** Application **trusts server-side `fetchPaymentStatus`** from OPPWA using the **bearer token** — **not** a public signature on the redirect query string. **No HMAC of `id`** is verified in PHP.

### Result codes and 3D Secure

`ZimswitchPaymentStatusMapper` implements Hyperpay-style **regex buckets** on `result.code`:

- Success patterns like `000.000.*`, etc.
- Pending `000.200.*`
- **3DS-related rejects** via `REJECTED_3DS_PATTERN`
- “Success with manual review” bucket

If `copy_and_pay_result_codes.json` is empty, textual descriptions often fall back to gateway’s `result.description` where possible.

### Credentials

| Item | Configuration |
| --- | --- |
| Bearer token | `ZIMSWITCH_AUTHORIZATION_TOKEN` (alias `PAYMENT_AUTHORIZATION_TOKEN` in config merge) |
| Entity IDs | Embedded per **payment option** in `config/zimswitch.php` and DB settings (Visa/MC vs ZimSwitch rails vs ZIG). |
| Payment type | `ZIMSWITCH_PAYMENT_TYPE` default `DB` (Direct Debit / card) |

Obtain credentials from **ZimSwitch / acquirer / OPPWA merchant onboarding**.

### Test vs live

- Use OPPWA **test mode header** (`ZIMSWITCH_TEST_MODE`, e.g. `INTERNAL`) per env comments — **omit in production**.
- **SSL verification** can be disabled via `ZIMSWITCH_VERIFY_SSL=false` (local dev only).

### Currency

- Checkout creation uses **invoice currency** and amount as displayed for hosted checkout.
- `PaymentService` stores **USD** in `payments.amount` with optional `paid_currency` / `paid_amount` snapshot.

---

## Section 5 — E-Invoicing and Fiscalization

### Findings

Searches for **ZIMRA**, **fiscal**, **fiscalization**, **QR** codes tied to tax authority, **FDMS**, etc. returned **no matches** in this codebase.

### What exists instead

- **Invoices** are standard commercial documents: HTML view `resources/views/invoices/document.blade.php` and PDF export via **Dompdf** (`InvoiceController::download`).
- Branding (logo as data URI, issuer name/address lines, payment method blurbs) comes from **`config/billing.php`** env keys (`BILLING_INVOICE_*`) and `InvoiceDocumentBranding`.
- **No cryptographic fiscal stamp**, **no ZIMRA API client**, **no QR code generation** for tax authority integration appears in the repository.

**Conclusion:** This application **does not implement Zimbabwe fiscalization / ZIMRA e-invoicing** in the sense of a government-mandated signed fiscal receipt. If fiscal compliance is required, it would be **new work** outside this codebase.

---

## Section 6 — Authentication and Security

### User authentication

- **Session guard** for `/login` → dashboard (cookie session). Password requirements tightened in production via `Password::defaults` in `AppServiceProvider`.
- **`EnsureUserHasTeam` (`tenant` middleware)** ensures a `team_id` exists for UI routes.

### API authentication

- **`X-API-Key` header** required when no session user: keys prefixed `axb_`, looked up by prefix, verified with **SHA-256 hash** (`ApiKey` model).
- Keys may be **scoped to products** via `api_key_products`; unscoped keys are rejected.
- **Rate limiting:** `throttle:billing-api` uses `config('billing.api_rate_limit')` per minute per user id or IP (`AppServiceProvider`).

### Secrets storage

- **`.env`** for bootstrap and CI secrets.
- **Database (`settings` table)** for gateways and mail after onboarding (preferred in production UI).
- **API keys** stored hashed (`key_hash`); raw key shown only once at creation time (pattern in `ApiKey` / controller — not expanded here).

### Webhook / HMAC

- **Axis outbound webhooks** (`SendAxisWebhook`): `X-Axis-Signature: HMAC-SHA256(body, AXIS_WEBHOOK_SECRET)` over raw JSON body. **Inbound EcoCash** notifications: **no signature verification** in code (see Section 3).

### Other

- **Sentry** optional for error telemetry (`config/sentry.php`).
- **HTTPS** is assumed for production gateways; OPPWA client allows disabling TLS verify only via config for dev.
- **IP whitelisting** is **not** implemented in application code for EcoCash callbacks.

---

## Section 7 — Environment Variables and Configuration Values

Below are **significant** keys from `.env.example` and configs. “**Live vs test**” is determined by **which URLs and credentials you configure**, not a single global flag (except Omari `OMARI_PRODUCTION` and OPPWA `ZIMSWITCH_TEST_MODE` header).

| Variable | Purpose | Typical source |
| --- | --- | --- |
| `APP_KEY` | Encryption / sessions | `php artisan key:generate` |
| `APP_ENV`, `APP_DEBUG`, `APP_URL` | Environment behavior | Deployment |
| `APP_TIMEZONE` | Scheduler / invoice times | Default `Africa/Harare` in config |
| `DB_*` | Database connection | DBA |
| `SESSION_DRIVER` | Sessions | `database` in example |
| `QUEUE_CONNECTION`, `REDIS_*` | Queues / Horizon | Infra |
| `BILLING_CACHE_TTL`, `BILLING_API_RATE_LIMIT` | Catalog cache + API throttle | Ops tuning |
| `BILLING_INVOICE_*` | PDF issuer + logo path | Branding |
| `MAIL_*` | Mail fallback before DB settings | SMTP provider |
| `AXIS_WEBHOOK_URL`, `AXIS_WEBHOOK_SECRET`, `AXIS_WEBHOOK_TIMEOUT` | Outbound Axis webhooks | Axis integration |
| `ECOCASH_*` | EcoCash gateway | EcoCash merchant onboarding |
| `ZIMSWITCH_*` | OPPWA | Acquirer / Hyperpay dashboard |
| `OMARI_*` | Omari vSuite | Omari merchant portal |
| `SENTRY_LARAVEL_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | Error tracking | Sentry.io |
| `API_VERSION` | Scramble / API metadata | Internal |
| `VITE_*` | Frontend build / Wayfinder | Dev environment |

**Database settings** (mirror many of the above after migration) are edited in **System configuration** and should be treated as **production secrets** (`EcoCashSettings`, `ZimswitchSettings`, `OmariSettings`, `MailSettings`, `ApplicationSettings`, `PaymentNotificationSettings`).

---

## Section 8 — API Reference Summary (Outbound HTTP)

| Provider | Purpose | Method | URL (pattern) | Auth type |
| --- | --- | --- | --- | --- |
| EcoCash Holdings | Initiate debit push | `POST` | `{ECOCASH_API_URL}` (default EcoCash PayOnline URL) | HTTP Basic (username/password) |
| OPPWA / Hyperpay | Create checkout | `POST` | `{ZIMSWITCH_BASE_URL}/v1/checkouts?...` | Bearer token |
| OPPWA / Hyperpay | Get payment result | `GET` | `{ZIMSWITCH_BASE_URL}/v1/checkouts/{id}/payment?entityId=...` | Bearer token |
| Omari vSuite | Auth / OTP step | `POST` | `{OMARI_MERCHANT_BASE_URL}/auth` | Header `X-Merchant-Key` |
| Omari vSuite | Submit OTP / pay | `POST` | `{OMARI_MERCHANT_BASE_URL}/requests` | `X-Merchant-Key` |
| Omari vSuite | Query by reference | `GET` | `{OMARI_MERCHANT_BASE_URL}/query/{reference}` | `X-Merchant-Key` |
| Omari vSuite | Void | `POST` | `{OMARI_MERCHANT_BASE_URL}/void` | `X-Merchant-Key` |
| Axis apps (optional) | Event webhook | `POST` | `{AXIS_WEBHOOK_URL}` | HMAC header `X-Axis-Signature` |
| Sentry | Error reporting | SDK | Sentry ingest URL (SDK) | DSN token |

**Browser-loaded (not server outbound, but external):**  
`GET {ZIMSWITCH_BASE_URL}/v1/paymentWidgets.js?checkoutId=...` — executed in customer browser.

---

## Section 9 — What Is Fully Working vs Incomplete

### Fully implemented paths (as far as code + tests indicate)

- **EcoCash** staff initiation + transaction persistence + notify webhook + payment recording + hosted checkout wait polling — covered by `EcoCashFlowTest` / `EcoCashNotifyTest`.
- **ZimSwitch hosted checkout** — create checkout, widget page, return handler, payment recording — `ZimswitchCheckoutTest` + controller logic.
- **OPPWA status polling** for authenticated flow — tests.
- **Omari** HTTP client + hosted OTP flow in `PublicCheckoutController` (see `OmariService`).
- **Checkout sessions + subscription finalize** on `PaymentCompleted`.
- **Axis outbound webhooks** when URL configured.

### Gaps / risks / ambiguities

1. **`ZimswitchController` + `ZIMSWITCH_ENTITY_ID`:** Config key `zimswitch.entity_id` is **not** present in `config/zimswitch.php` or `.env.example`. **Authenticated** `POST /zimswitch/checkout` likely **503** unless you add this to config or extend settings bridging. **Hosted checkout** works via `payment_options` entity ids.
2. **EcoCash inbound security:** No signature verification on `/api/ecocash/notify` — **spoofing risk** if endpoint is public.
3. **EcoCash field semantics:** `merchantNumber` equals customer phone — confirm with gateway docs.
4. **Result code JSON** for ZimSwitch is **empty** in-repo — descriptions rely on regex categories and gateway text.
5. **Fiscalization / ZIMRA** — **not implemented** (Section 5).

### Hardcoded values

- Demo **OPPWA entity IDs** are committed in `config/zimswitch.php` and settings migrations — should be **reviewed** for your merchant account.
- Default issuer address strings in `config/billing.php` / `.env.example` — replace for production branding.

---

## Section 10 — Integration Guide for a Next.js Developer

### EcoCash — minimal viable implementation

1. **Prerequisites**
   - Store **USD invoice total** and maintain **FX rate** (USD → ZWG or other) if charging locally.
   - Obtain EcoCash **API URL**, **Basic auth**, **merchant code/PIN**, **terminal**, metadata fields.

2. **Initiate payment (server route)**  
   - `POST` to EcoCash URL with JSON body exactly as **Section 3** (`buildPayload` shape).  
   - Save **`clientCorrelator`** and **`referenceCode`** in your DB before trusting response.

3. **Handle webhook**  
   - Expose `POST /api/ecocash/notify` (or equivalent).  
   - Match `clientCorrelator` / `referenceCode` to your row.  
   - **Recommended:** Add **signature verification** if EcoCash provides one (this PHP app does not).  
   - On success, convert local amount → USD with your FX table; mark invoice paid idempotently.

4. **Client polling**  
   - Poll your own DB/API every few seconds for payment completion (this app uses **5s** on the wait page calling **`/pay/{id}/status`**).

5. **Store at each step**
   - After initiate: pending transaction + references + local amount/currency + raw response JSON.  
   - After notify success: payment row + invoice paid + transaction completed timestamp.

### ZimSwitch (OPPWA Copy & Pay) — minimal viable implementation

1. **Server:** `POST {base}/v1/checkouts` with query `entityId`, `amount`, `currency`, `paymentType` + Bearer token. Save returned **`id`** as checkout id.

2. **Client:** Load `paymentWidgets.js` with that id; render OPPWA form with correct `data-brands` for your entity.

3. **Return URL:** Read `id` query; **server-side** `GET {base}/v1/checkouts/{id}/payment?entityId=...` to get `result.code`. Map success/failure using Hyperpay docs (reuse regex strategy from `ZimswitchPaymentStatusMapper` if desired).

4. **Idempotency:** Use checkout `id` as **`transaction_reference`** when inserting payments.

5. **3DS:** Handled inside OPPWA widget/redirects; your code only interprets **result codes** afterward.

---

## Appendix — Laravel routes reference (quick)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/ecocash/notify` | Public EcoCash webhook |
| `POST` | `/ecocash/initiate` | Authenticated (web middleware + tenant) |
| `GET` | `/ecocash/status/{referenceCode}` | Authenticated |
| `POST` | `/zimswitch/checkout` | Authenticated |
| `GET` | `/zimswitch/checkout/{checkoutId}/status` | Authenticated + `invoice_id` query |
| `GET` | `/pay/{publicId}` | Hosted checkout |
| `POST` | `/pay/{publicId}/zimswitch/start` | Begin card flow |
| `GET` | `/pay/{publicId}/zimswitch/widget` | Widget page |
| `GET` | `/pay/{publicId}/zimswitch/return` | OPPWA return |
| `POST` | `/api/checkout-sessions` | API key auth |

*(Exact middleware: see `routes/web.php` and `routes/api.php`.)*

---

## Appendix — Complete file manifest (384 paths)

Paths below are relative to `ref-codebases/billing/`. One-line descriptions for each area appear in **Section 1**; this list ensures every file path is enumerated.

- `.editorconfig`
- `.env.example`
- `.gitattributes`
- `.github/workflows/lint.yml`
- `.github/workflows/tests.yml`
- `.gitignore`
- `.npmrc`
- `.prettierignore`
- `.prettierrc`
- `app/Console/Commands/InvoicesRunDailyScheduleCommand.php`
- `app/DAO/CustomerDao.php`
- `app/DAO/ExchangeRateDao.php`
- `app/DAO/Interfaces/CustomerDaoInterface.php`
- `app/DAO/Interfaces/ExchangeRateDaoInterface.php`
- `app/DAO/Interfaces/InvoiceDaoInterface.php`
- `app/DAO/Interfaces/InvoiceItemDaoInterface.php`
- `app/DAO/Interfaces/PaymentDaoInterface.php`
- `app/DAO/Interfaces/PlanDaoInterface.php`
- `app/DAO/Interfaces/ProductDaoInterface.php`
- `app/DAO/Interfaces/SubscriptionDaoInterface.php`
- `app/DAO/InvoiceDao.php`
- `app/DAO/InvoiceItemDao.php`
- `app/DAO/PaymentDao.php`
- `app/DAO/PlanDao.php`
- `app/DAO/ProductDao.php`
- `app/DAO/SubscriptionDao.php`
- `app/Data/Api/StoreCustomerData.php`
- `app/Data/Api/StoreInvoiceData.php`
- `app/Data/Api/StoreInvoiceItemData.php`
- `app/Data/Api/StorePlanData.php`
- `app/Data/Api/StoreProductData.php`
- `app/Data/Api/StoreUserData.php`
- `app/Data/Api/UpdateCustomerData.php`
- `app/Data/Api/UpdateInvoiceData.php`
- `app/Data/Api/UpdateInvoiceItemData.php`
- `app/Data/Api/UpdatePaymentData.php`
- `app/Data/Api/UpdatePlanData.php`
- `app/Data/Api/UpdateProductData.php`
- `app/Data/Api/UpdateSubscriptionData.php`
- `app/Data/Api/UpdateUserData.php`
- `app/Data/CancelSubscriptionInputData.php`
- `app/Data/Concerns/FromValidatedRequest.php`
- `app/Data/CreateCheckoutSessionInputData.php`
- `app/Data/CreateSubscriptionInputData.php`
- `app/Data/CustomerDto.php`
- `app/Data/GenerateInvoiceFromSubscriptionInputData.php`
- `app/Data/InvoiceDto.php`
- `app/Data/InvoiceItemDto.php`
- `app/Data/PaymentDto.php`
- `app/Data/PlanDto.php`
- `app/Data/ProductDto.php`
- `app/Data/RecordPaymentInputData.php`
- `app/Data/RenewSubscriptionInputData.php`
- `app/Data/SubscriptionDto.php`
- `app/Data/TransitionSubscriptionStatusInputData.php`
- `app/Data/UserDto.php`
- `app/Enums/BillingInterval.php`
- `app/Enums/EcocashTransactionStatus.php`
- `app/Enums/InvoiceGeneratedSource.php`
- `app/Enums/InvoiceStatus.php`
- `app/Enums/PaymentPlatform.php`
- `app/Enums/PaymentStatus.php`
- `app/Enums/SubscriptionStatus.php`
- `app/Events/InvoiceGenerated.php`
- `app/Events/InvoicePaid.php`
- `app/Events/PaymentCompleted.php`
- `app/Events/SubscriptionActivated.php`
- `app/Events/SubscriptionCanceled.php`
- `app/Events/SubscriptionCreated.php`
- `app/Events/SubscriptionRenewed.php`
- `app/Events/SubscriptionStatusChanged.php`
- `app/Exceptions/InvalidSubscriptionTransitionException.php`
- `app/Exceptions/InvoiceGenerationException.php`
- `app/Exceptions/PaymentRecordingException.php`
- `app/Filesystem/Filesystem.php`
- `app/Http/Api/ApiResponse.php`
- `app/Http/Controllers/Api/CheckoutSessionController.php`
- `app/Http/Controllers/Api/HealthController.php`
- `app/Http/Controllers/Api/PlanController.php`
- `app/Http/Controllers/Api/ProductController.php`
- `app/Http/Controllers/Api/SubscriptionController.php`
- `app/Http/Controllers/ApiKeyController.php`
- `app/Http/Controllers/AuditTrailController.php`
- `app/Http/Controllers/Auth/AuthenticatedSessionController.php`
- `app/Http/Controllers/BillingIntervalConfigController.php`
- `app/Http/Controllers/BillingIntervalController.php`
- `app/Http/Controllers/Controller.php`
- `app/Http/Controllers/CustomerController.php`
- `app/Http/Controllers/DashboardController.php`
- `app/Http/Controllers/EcoCashController.php`
- `app/Http/Controllers/ExchangeRateController.php`
- `app/Http/Controllers/InvoiceController.php`
- `app/Http/Controllers/InvoiceItemController.php`
- `app/Http/Controllers/LegalController.php`
- `app/Http/Controllers/PaymentController.php`
- `app/Http/Controllers/PlanController.php`
- `app/Http/Controllers/ProductController.php`
- `app/Http/Controllers/PublicCheckoutController.php`
- `app/Http/Controllers/Reports/CustomerReportController.php`
- `app/Http/Controllers/Reports/InvoiceReportController.php`
- `app/Http/Controllers/Reports/RevenueReportController.php`
- `app/Http/Controllers/Reports/SubscriptionReportController.php`
- `app/Http/Controllers/SubscriptionController.php`
- `app/Http/Controllers/SystemConfigurationController.php`
- `app/Http/Controllers/TeamController.php`
- `app/Http/Controllers/UserController.php`
- `app/Http/Controllers/WelcomeController.php`
- `app/Http/Controllers/ZimswitchController.php`
- `app/Http/Middleware/AuthenticateWithApiKey.php`
- `app/Http/Middleware/EnsureUserHasTeam.php`
- `app/Http/Middleware/HandleInertiaRequests.php`
- `app/Listeners/FinalizeCheckoutSessionOnPaymentCompleted.php`
- `app/Listeners/LogBillingEvents.php`
- `app/Listeners/NotifyTeamBillingEvents.php`
- `app/Listeners/SendAxisWebhook.php`
- `app/Listeners/SendPaymentSuccessNotificationEmails.php`
- `app/Mail/InvoiceOverdueReminderMail.php`
- `app/Mail/PaymentSucceededMail.php`
- `app/Models/ApiKey.php`
- `app/Models/Audit.php`
- `app/Models/BillingIntervalConfig.php`
- `app/Models/CheckoutSession.php`
- `app/Models/Concerns/AuditableTeamScoped.php`
- `app/Models/Concerns/HasTeamScope.php`
- `app/Models/Customer.php`
- `app/Models/EcocashTransaction.php`
- `app/Models/ExchangeRate.php`
- `app/Models/Invoice.php`
- `app/Models/InvoiceItem.php`
- `app/Models/Payment.php`
- `app/Models/Plan.php`
- `app/Models/Product.php`
- `app/Models/Subscription.php`
- `app/Models/Team.php`
- `app/Models/User.php`
- `app/Notifications/BillingNotification.php`
- `app/Providers/AppServiceProvider.php`
- `app/Providers/EventServiceProvider.php`
- `app/Providers/HorizonServiceProvider.php`
- `app/Providers/RepositoryServiceProvider.php`
- `app/Repositories/CustomerRepository.php`
- `app/Repositories/ExchangeRateRepository.php`
- `app/Repositories/Interfaces/CustomerRepositoryInterface.php`
- `app/Repositories/Interfaces/ExchangeRateRepositoryInterface.php`
- `app/Repositories/Interfaces/InvoiceItemRepositoryInterface.php`
- `app/Repositories/Interfaces/InvoiceRepositoryInterface.php`
- `app/Repositories/Interfaces/PaymentRepositoryInterface.php`
- `app/Repositories/Interfaces/PlanRepositoryInterface.php`
- `app/Repositories/Interfaces/ProductRepositoryInterface.php`
- `app/Repositories/Interfaces/SubscriptionRepositoryInterface.php`
- `app/Repositories/InvoiceItemRepository.php`
- `app/Repositories/InvoiceRepository.php`
- `app/Repositories/PaymentRepository.php`
- `app/Repositories/PlanRepository.php`
- `app/Repositories/ProductRepository.php`
- `app/Repositories/SubscriptionRepository.php`
- `app/Services/ApiKeyService.php`
- `app/Services/AuditService.php`
- `app/Services/BillingIntervalConfigService.php`
- `app/Services/CheckoutSessionService.php`
- `app/Services/CustomerService.php`
- `app/Services/DashboardService.php`
- `app/Services/EcoCashService.php`
- `app/Services/ExceptionReporter.php`
- `app/Services/ExchangeRateService.php`
- `app/Services/InvoiceItemService.php`
- `app/Services/InvoiceScheduleService.php`
- `app/Services/InvoiceService.php`
- `app/Services/OmariService.php`
- `app/Services/PaymentService.php`
- `app/Services/PlanService.php`
- `app/Services/ProductService.php`
- `app/Services/Reports/CustomerReportService.php`
- `app/Services/Reports/InvoiceReportService.php`
- `app/Services/Reports/RevenueReportService.php`
- `app/Services/Reports/SubscriptionReportService.php`
- `app/Services/SubscriptionService.php`
- `app/Services/UserService.php`
- `app/Services/ZimswitchCopyPayService.php`
- `app/Services/ZimswitchPaymentStatusMapper.php`
- `app/Settings/ApplicationSettings.php`
- `app/Settings/Casts/AssocArrayCast.php`
- `app/Settings/EcoCashSettings.php`
- `app/Settings/MailSettings.php`
- `app/Settings/OmariSettings.php`
- `app/Settings/PaymentNotificationSettings.php`
- `app/Settings/ZimswitchSettings.php`
- `app/Support/ApiValidationRules.php`
- `app/Support/BillingCacheKeys.php`
- `app/Support/BillingValidationRules.php`
- `app/Support/InvoiceDocumentBranding.php`
- `app/Support/ReportsByMonth.php`
- `artisan`
- `azure-pipelines.yml`
- `bootstrap/app.php`
- `bootstrap/cache/.gitignore`
- `bootstrap/providers.php`
- `composer.json`
- `composer.lock`
- `config/app.php`
- `config/audit.php`
- `config/auth.php`
- `config/billing.php`
- `config/cache.php`
- `config/database.php`
- `config/ecocash.php`
- `config/filesystems.php`
- `config/horizon.php`
- `config/inertia.php`
- `config/logging.php`
- `config/log-viewer.php`
- `config/mail.php`
- `config/omari.php`
- `config/queue.php`
- `config/scramble.php`
- `config/sentry.php`
- `config/services.php`
- `config/session.php`
- `config/settings.php`
- `config/zimswitch.php`
- `database/.gitignore`
- `database/factories/CustomerFactory.php`
- `database/factories/InvoiceFactory.php`
- `database/factories/InvoiceItemFactory.php`
- `database/factories/PaymentFactory.php`
- `database/factories/PlanFactory.php`
- `database/factories/ProductFactory.php`
- `database/factories/SubscriptionFactory.php`
- `database/factories/TeamFactory.php`
- `database/factories/UserFactory.php`
- `database/migrations/0001_01_01_000000_create_users_table.php`
- `database/migrations/0001_01_01_000001_create_cache_table.php`
- `database/migrations/0001_01_01_000002_create_jobs_table.php`
- `database/migrations/2026_03_30_213300_create_teams_table.php`
- `database/migrations/2026_03_30_213302_add_team_id_to_users_table.php`
- `database/migrations/2026_03_30_213304_create_customers_table.php`
- `database/migrations/2026_03_30_213305_create_products_table.php`
- `database/migrations/2026_03_30_213306_create_plans_table.php`
- `database/migrations/2026_03_30_213307_create_subscriptions_table.php`
- `database/migrations/2026_03_30_213945_create_invoices_table.php`
- `database/migrations/2026_03_30_214107_create_invoice_items_table.php`
- `database/migrations/2026_03_30_214212_create_payments_table.php`
- `database/migrations/2026_03_30_220000_backfill_teams_for_users_without_team_id.php`
- `database/migrations/2026_03_30_231000_create_notifications_table.php`
- `database/migrations/2026_03_30_240000_add_billing_performance_indexes.php`
- `database/migrations/2026_03_30_300000_create_audits_table.php`
- `database/migrations/2026_03_31_100000_create_billing_interval_configs_table.php`
- `database/migrations/2026_03_31_200000_create_api_keys_table.php`
- `database/migrations/2026_03_31_300000_create_exchange_rates_table.php`
- `database/migrations/2026_03_31_300001_add_exchange_rate_columns_to_payments_table.php`
- `database/migrations/2026_03_31_400000_create_ecocash_transactions_table.php`
- `database/migrations/2026_03_31_500000_add_payment_platforms_to_plans_and_subscriptions.php`
- `database/migrations/2026_04_01_120000_add_email_to_customers_table.php`
- `database/migrations/2026_04_07_000000_create_checkout_sessions_table.php`
- `database/migrations/2026_04_07_000001_add_checkout_session_id_to_invoices_table.php`
- `database/migrations/2026_04_07_160000_create_settings_table.php`
- `database/migrations/2026_04_07_160001_add_locked_to_settings_table.php`
- `database/migrations/2026_04_09_000000_create_api_key_products_table.php`
- `database/migrations/2026_04_14_000001_add_trial_days_to_plans_table.php`
- `database/seeders/DatabaseSeeder.php`
- `database/seeders/LargeDatasetSeeder.php`
- `database/settings/2026_04_07_171455_create_payment_gateway_settings.php`
- `database/settings/2026_04_08_120000_add_mail_and_payment_notification_settings.php`
- `database/settings/2026_04_08_130000_add_application_settings.php`
- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `phpunit.xml`
- `pint.json`
- `postcss.config.cjs`
- `public/.htaccess`
- `public/apple-touch-icon.png`
- `public/favicon.ico`
- `public/favicon.svg`
- `public/images/axis-logo.svg`
- `public/index.php`
- `public/logo.png`
- `public/payment-platform-logos/ecocash.png`
- `public/payment-platform-logos/innbucks.png`
- `public/payment-platform-logos/omari.png`
- `public/payment-platform-logos/zimswitch.png`
- `public/robots.txt`
- `README-hosted-checkout.md`
- `resources/css/app.css`
- `resources/data/zimswitch/copy_and_pay_result_codes.json`
- `resources/js/app.tsx`
- `resources/js/components/ColorSchemeToggle.tsx`
- `resources/js/components/ui/DataTableCard.tsx`
- `resources/js/components/ui/EmptyState.tsx`
- `resources/js/components/ui/FormWrapper.tsx`
- `resources/js/components/ui/PageContainer.tsx`
- `resources/js/components/ui/SectionHeader.tsx`
- `resources/js/components/ui/TablePaginationBar.tsx`
- `resources/js/layouts/AppShellLayout.tsx`
- `resources/js/layouts/AuthLayout.tsx`
- `resources/js/layouts/LandingLayout.tsx`
- `resources/js/layouts/PaymentsLayout.tsx`
- `resources/js/lib/api.ts`
- `resources/js/pages/api-keys/Index.tsx`
- `resources/js/pages/audit/Index.tsx`
- `resources/js/pages/auth/login.tsx`
- `resources/js/pages/billing-intervals/Index.tsx`
- `resources/js/pages/customers/Index.tsx`
- `resources/js/pages/customers/Show.tsx`
- `resources/js/pages/dashboard.tsx`
- `resources/js/pages/exchange-rates/Index.tsx`
- `resources/js/pages/invoices/Index.tsx`
- `resources/js/pages/legal/PrivacyPolicy.tsx`
- `resources/js/pages/legal/Terms.tsx`
- `resources/js/pages/payments/Index.tsx`
- `resources/js/pages/plans/Index.tsx`
- `resources/js/pages/products/Index.tsx`
- `resources/js/pages/public-checkout/Complete.tsx`
- `resources/js/pages/public-checkout/EcoCash.tsx`
- `resources/js/pages/public-checkout/EcoCashWait.tsx`
- `resources/js/pages/public-checkout/Omari.tsx`
- `resources/js/pages/public-checkout/Show.tsx`
- `resources/js/pages/public-checkout/ZimswitchWidget.tsx`
- `resources/js/pages/reports/Customers.tsx`
- `resources/js/pages/reports/Invoices.tsx`
- `resources/js/pages/reports/Revenue.tsx`
- `resources/js/pages/reports/Subscriptions.tsx`
- `resources/js/pages/subscriptions/Index.tsx`
- `resources/js/pages/system-configuration/Index.tsx`
- `resources/js/pages/team/Index.tsx`
- `resources/js/pages/welcome.tsx`
- `resources/js/providers/AppProviders.tsx`
- `resources/js/theme.ts`
- `resources/js/types/auth.ts`
- `resources/js/types/global.d.ts`
- `resources/js/types/index.ts`
- `resources/js/types/vite-env.d.ts`
- `resources/views/app.blade.php`
- `resources/views/invoices/document.blade.php`
- `resources/views/mail/invoice-overdue-reminder.blade.php`
- `resources/views/mail/payment-succeeded.blade.php`
- `routes/api.php`
- `routes/console.php`
- `routes/web.php`
- `scripts/setup-horizon-supervisor.sh`
- `scripts/supervisor/laravel-horizon.conf.template`
- `storage/app/.gitignore`
- `storage/app/private/.gitignore`
- `storage/app/public/.gitignore`
- `storage/framework/.gitignore`
- `storage/framework/cache/.gitignore`
- `storage/framework/cache/data/.gitignore`
- `storage/framework/sessions/.gitignore`
- `storage/framework/testing/.gitignore`
- `storage/framework/views/.gitignore`
- `storage/logs/.gitignore`
- `tests/Feature/Api/ApiKeyProductScopingTest.php`
- `tests/Feature/Api/CustomerApiTest.php`
- `tests/Feature/Api/HealthApiTest.php`
- `tests/Feature/Api/InvoiceApiTest.php`
- `tests/Feature/Api/InvoiceItemApiTest.php`
- `tests/Feature/Api/PaymentApiTest.php`
- `tests/Feature/Api/PlanApiTest.php`
- `tests/Feature/Api/ProductApiTest.php`
- `tests/Feature/Api/SubscriptionApiTest.php`
- `tests/Feature/Api/TenantIsolationTest.php`
- `tests/Feature/BillingListenersTest.php`
- `tests/Feature/EcoCashFlowTest.php`
- `tests/Feature/EcoCashNotifyTest.php`
- `tests/Feature/ExampleTest.php`
- `tests/Feature/ExchangeRatesAndApiKeysTest.php`
- `tests/Feature/HorizonDashboardTest.php`
- `tests/Feature/InvoicesDailyScheduleTest.php`
- `tests/Feature/TeamAndUsersTest.php`
- `tests/Feature/Web/AuthenticatedInertiaAndReportsTest.php`
- `tests/Feature/Web/GuestAuthTest.php`
- `tests/Feature/Web/InvoiceDocumentTest.php`
- `tests/Feature/Web/LogoutTest.php`
- `tests/Feature/ZimswitchCheckoutTest.php`
- `tests/Pest.php`
- `tests/Support/billing.php`
- `tests/TestCase.php`
- `tests/Unit/AppFilesystemTest.php`
- `tests/Unit/InvoiceStatusTest.php`
- `tests/Unit/OmariServiceTest.php`
- `tests/Unit/ReportsByMonthTest.php`
- `tests/Unit/ZimswitchPaymentStatusMapperTest.php`
- `tsconfig.json`
- `vite.config.ts`

---

*End of `BILLING_DOCS.md`.*
