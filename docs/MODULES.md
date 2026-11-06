# Module map

One app serves six jobs. This page says which folders belong to which job and where the jobs wrongly lean on each other.
It describes how the code is **today**. Nothing enforces these boundaries yet; moving files is a separate, later step.

## The six modules

| Module | Job | Pages | API | Logic (`lib/`) | Data (`database/`) |
|---|---|---|---|---|---|
| **pos** | Tills, cashiers, branch POS settings, sales at the till | `app/(pos)`, `pos-sales`, `pos-products`, `pos-customers`, `pos-settings` | `app/api/pos/*` | `lib/pos/*`, `posSale`, `posTill`, `posBranch`, `posCatalog`, `posNumbering`, `posInvoiceEmail`, `despatchScan` services | `posSale`, `posProduct`, `posCustomer`, `till`, `posNumberLease`, `despatchScan`, `invoiceCounter` |
| **fiscal** | ZIMRA devices, certificates, fiscal day, Z-reports | `fiscal-day`, `fiscal-settings`, `fiscal-devices`, `z-reports` | `app/api/admin/{fiscal-*,z-reports}` | `lib/fiscal/*`, `lib/zimra*.ts`, `fiscal*` services, `zimraFiscal`, `zimraPosDevice`, `fiscal-service/` (separate process) | `fiscalDevice`, `fiscalSettings`, `fiscalDayControl`, `fiscalCloseAttempt`, `fiscalAlert*`, `fiscalCertEvent`, `zReport` |
| **stock** | Stock uploads and the product list | `uploads/*`, `products`, `product-movement` | `app/api/{upload,products}`, `admin/products` | `lib/upload/*` | `upload`, `uploadproduct`, `productmaster`, `weekly_product_summaries` |
| **analytics** | Dashboards and reports on stock and POS | `dashboard`, `branch-analytics`, `branch-up-reports`, `ai-agent` | `app/api/analytics`, `ai-agent`, `pos/analytics` | `lib/analytics/*`, `lib/ai`, `analytics.action`, `posAnalytics` | (reads the stock and POS data) |
| **shop** | Storefront, quotations, online payments | `app/(shop)/*`, `admin/quotations`, `admin/invoices`, `homepage` | `app/api/shop/*`, `payments/*`, `admin/{quotations,invoices,homepage-config}` | `lib/shop/*`, `invoice`, `invoiceSeller`, `ecocash`, `zimswitch`, `postPaymentInvoice`, `lib/utils/recordPayment.ts` | `quotation`, `invoice`, `customer`, `ecocashTransaction`, `zimswitchCheckout`, `homepage-config`, `shop-public-stats` |
| **admin** | People, branches, access, settings | `users`, `branches`, `access`, `settings`, `exchange-rates` | `app/api/{users,branches,menu-access,accounts}`, `admin/{email-settings,exchange-rates,menu-access}` | `lib/auth/*`, `menuAccess`, `emailSettings`, `exchangeRate` | `user`, `branch`, `store`, `account`, `role`, `roleMenu`, `emailSettings`, `exchangeRate` |

`app/api/cron/*`, `app/api/scan/*` and `app/api/auth/*` are entry points for the jobs above and for sign-in, not modules of their own.

## Where the modules lean on each other the wrong way

Worst first. These come from the audit and have not all been re-verified line by line.

1. ~~**shop to fiscal, directly.**~~ **Fixed 2026-11-06.** The payment path now goes through `lib/fiscal/issue.ts`; a ZIMRA or device problem queues the invoice and the cron retries it. See `docs/FISCAL_OUTAGE_RECOVERY.md`.
2. ~~**Two credit-note implementations.**~~ **Not true (checked 2026-11-06).** Credit notes exist only at the till (`issueCreditNote`). The shop has only a `receiptType` label with no link to an original invoice; `fiscalizeInvoice` now refuses anything but a plain invoice, so one cannot reach ZIMRA and upset a day close.
3. **Analytics sees only POS data.** Shop invoices are probably left out of the totals. Not confirmed.
4. **Stock is shared three ways.** The POS catalogue, the shop product list and despatch scans all read stock tables.
5. **Exchange rates** feed prices in both the shop and the fiscal/POS side.
6. **Seller details** (`invoiceSeller`) are used by both the public shop and fiscal invoices.
7. **Three fiscal-document issuers.** `invoice.service`, `posSale.service` and `postPaymentInvoice.service` all issue fiscal documents. **Partly fixed:** callers now use one door (`issueFiscalDocument`), but the two engines behind it (`posSale.service` for the till, `invoice.service` for the shop) are still separate.

## Two route-naming oddities to know about

- Only invoices and quotations live under `/admin/`; every other admin page is a top-level route, some with a `pos-` prefix.
- The shop has overlapping API trees (`shop/quotations`, `shop/account/quotations`, `shop/dashboard/quotations`) for the same data.

## Suggested order for tightening this (not started)

1. ~~Put fiscal issuing behind one entry point that pos and shop both call, so a failed device means "queued" rather than "failed" in both.~~ **Done** (`lib/fiscal/issue.ts`).
2. ~~Merge the two credit-note paths.~~ Nothing to merge: only the till has credit notes. If the shop ever needs them, build one that records the original invoice, then issue it through `lib/fiscal/issue.ts`.
3. Collapse the shop's overlapping API trees.
4. Add one `/admin/sales` view over quotations, invoices and POS sales, so there is one place to find a sale.
5. Only then move folders, and add a lint rule that stops a module importing another's internals.

Do the shop work only when the storefront is back in scope; for now the shop is untouched on purpose.
