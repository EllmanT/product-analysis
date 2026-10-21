# Multi-device fiscal setup and certificate lifecycle: audit and plan

Status: PLAN ONLY. Nothing implemented. Written 2026-10-20 from three code/spec audits.
Sources: ZIMRA Fiscal Device Gateway API v7.2 (PDF), RevMax API 3.4.4 (for the licence question), and this repo.

## 1. Audit findings

### 1.1 Licensing
- Our code calls no licensing endpoint. There is no "licence" code anywhere.
- ZIMRA's Gateway spec has no licence concept (no match for "licen" in the 77 pages). The only licence we found is the RevMax driver's vendor licence (`SetLicense`/`GetLicense`, 1 year), which is Axis/RevMax DRM and not part of FDMS.
- We call the Axis Virtual Device (VD) wrapper at `/api/VirtualDevice/*`, not the raw Gateway. The VD may enforce a vendor licence that our code can't see. Confirm with Axis.
- Prerequisites in our code:
  - `OpenFiscalDay`: none (bare call).
  - `SubmitReceipt` (POS): none; it submits directly and relies on the device refusing.
  - `SubmitReceipt` (ERP invoice) and the scheduled close: call `GetStatus` first.
  - `GetConfig`: only the admin "Sync device" button calls it.
- The spec has no server-side rule that `getConfig` precedes `openDay` or `submitReceipt`. A registered device with a valid certificate can open the day and sell without it. `getConfig` is still a device "MUST" (req. 2): it supplies tax IDs, VAT status, max day hours and the QR URL.

### 1.2 Certificates today
- Stored in the `FiscalSettings` singleton as PEM, PFX and passphrase, in plaintext. Replaced only by manual upload.
- No expiry tracking, no CSR generation, no renewal, no alerting.
- mTLS options are built per request and only apply to https URLs. The Axis VD examples in `.env.example` are plain http (`:10005`, `:10007`), where certificates are ignored.
- `setPemCertificates` does not check that the certificate and key match.

### 1.3 ZIMRA certificate rules (Gateway v7.2)
- `registerDevice` (no cert): `deviceID` + `activationKey` + CSR gives the first certificate. CSR subject CN must be `ZIMRA-<serial>-<10-digit zero-padded deviceID>`. Other subject fields, if present, must be C=ZW, O=Zimbabwe Revenue Authority, S=Zimbabwe. Key types: ECC secp256r1 with SHA256 (preferred) or RSA 2048.
- `issueCertificate` (renewal): `deviceID` + new CSR (same rules), authenticated with the current, valid certificate. No activation key. Independent of fiscal day status. Recommended one month before expiry (req. 16).
- `getConfig.certificateValidTill`: authoritative expiry. After it the device cannot make any request (HTTP 401).
- The same certificate is both the TLS client cert and the receipt-signing cert.
- The spec is SILENT on: validity length (about 1 year is inferred), whether the old certificate is revoked on reissue, and recovery after expiry. Treat expiry as a hard outage.
- The spec gives no URL paths or HTTP verbs. They are in Swagger: https://fdmsapitest.zimra.co.zw/swagger/index.html.

### 1.4 Multiple devices
- Spec: a device belongs to one taxpayer branch. Counters (`receiptCounter`, `receiptGlobalNo`), the previous-receipt-hash chain and the open fiscal day are per device. Receipts must be sent one at a time in order. The spec sets no device limit, and is silent on sharing one device across branches.
- Code: numbering, sales, slips and QR data are already per branch. Everything at day level assumes one device (see section 4).

## 2. Decisions so far (from the user)
1. Extra devices are more Axis Virtual Devices on the same server, each with its own URL, device ID and login.
2. Per-device schedule (open/close time, timezone). Z-reports and alerts tagged per device.
3. ERP (non-POS) invoices always use the central device.
4. The application must own certificate add, update and renewal.
5. A branch's device is a configuration choice: use the central device (default) or its own. The central-device setup keeps working unchanged.

## 3. Phase 0 results (2026-10-20)
Read-only spike against the ZIMRA test gateway with the device 31591 bundle (`certificates_31591/`).
- **Direct mTLS works.** `GET https://fdmsapitest.zimra.co.zw/Device/v1/31591/GetConfig` with the device cert and key returned 200 (taxpayer AXIS SOLUTIONS (PVT) LTD, operating mode Online, `certificateValidTill` 2027-01-23T06:59:30, matching the certificate). Headers used: `DeviceModelName: Server`, `DeviceModelVersion: v1`. Our app can therefore hold the certificate and talk to the Gateway itself, which is Option 2 and what decision 4 needs. Windows `curl` cannot load PEM client certs; use Node.
- **Real paths (from Swagger, `/swagger/<name>/swagger.json`):**
  - Device-v1 (mTLS): `GET /Device/v1/{deviceID}/GetConfig`, `GetStatus`; `POST /Device/v1/{deviceID}/OpenDay`, `CloseDay`, `IssueCertificate`, `SubmitReceipt`, `Ping`, `SubmitFile`; `GET .../SubmittedFileList`; `GET /DeviceInformation/v1/{deviceID}/SearchBranches`.
  - Public-v1 (no cert): `POST /Public/v1/{deviceID}/RegisterDevice` (query `CacheKey`), `POST /Public/v1/{deviceID}/VerifyTaxpayerInformation`, `GET /Public/v1/GetServerCertificate?thumbprint=`.
  - ProductsStock-v1 and User-v1 also exist.
- **Certificate validity is one year** (31591: 2026-01-23 to 2027-01-23; issuer "for-device-signing"; CN `ZIMRA-VR-C182CEFC01FEE2FB-0000031591`). Device 31591 is a test device. It has ~94 days left, so it enters the 60-day warning window around 2026-11-24 and is a real renewal test case.
- **Not yet done:** `IssueCertificate` has not been called (it may replace or revoke the current certificate). Do it in Phase 5 against 31591 with the old bundle backed up. Licensing: the Gateway has none; whether the Axis VD enforces a vendor licence is still a question for Axis.

## 4. Strategy: multi-device

### Data model
- New `FiscalDevice` collection: name, `zimraApiUrl`, production flag, `deviceId`, `deviceSerialNumber`, certificate fields, VD login (encrypted), schedule fields, `lastAutoOpenDate`, `lastAutoCloseDate`, `isCentral`.
- The existing `FiscalSettings` document becomes the central device (migrated, behaviour unchanged).
- `Branch.pos.fiscalDeviceId` (optional ObjectId). Absent means central.
- `ZReport.fiscalDeviceId` plus device ID and serial. `PosSale.fiscalDeviceId` snapshotted at first submit.

### Device resolution
- `resolveDevice(branchId?)` returns `{ key, base, tls, auth, deviceId }`. It falls back to central only when no override is configured, and fails closed if an override device is incomplete (never silently fall back to central).
- Thread a device argument through `getZimraContext`, `zimraCall`, `deviceRequest` and the exported device functions.
- Never re-resolve the device for an existing invoice number. Use the snapshot, so a reassignment can't cause a duplicate fiscal receipt. Credit notes go to the device that signed the original.
- FDMS login token cache keyed per device.

### Isolation (the risky parts)
- Circuit breaker and in-flight limiter keyed per device. Today one outage turns every branch into provisional slips.
- `runPosQueue`, `closeFiscalDayWithReport`, `countPendingPosSales` and `waitForDeviceUpload` scoped to the device's branches. Central excludes branches with their own device.
- Scheduler loops over devices with `Promise.allSettled`, per-device `lastAuto*Date`, and alert keys that include the device.
- Date model: `soldDate` uses global `POS_TIMEZONE`; with per-device timezones it must use the device's timezone.
- Z-report totals grouped and labelled per device, never summed across devices.

### UI
- `fiscal-settings`: central form stays; add a devices list with create/edit, certificate upload and sync per device.
- `pos-settings`: per-branch selector "Use central device / own device".
- `fiscal-day` and `z-reports`: device selector, device column, device name on print pages.
- `pos/summary`: till shows its own branch device's status.

## 5. Strategy: certificate lifecycle (assuming Option 1 or 2 from section 3)
- Capture and store `certificateValidTill` (from `getConfig`) and the certificate's own `notAfter` per device. Show expiry in admin with a clear status.
- Daily cron: for each device, warn at 60 and 30 days (email, using the existing alert mechanism), and attempt automatic renewal at 30 days.
- Renewal sequence, no downtime:
  1. Generate a new keypair and CSR (CN `ZIMRA-<serial>-<10-digit deviceId>`, ECC secp256r1) in the app.
  2. Call `issueCertificate` using the current certificate.
  3. Verify the returned certificate matches the new key and has a later `notAfter`.
  4. Store the new cert and key as a pending slot; keep the old one active.
  5. Swap atomically (activate the new one), then confirm with a `getConfig` or `getStatus` call using it. On failure, roll back to the old one while it is still valid.
  6. Retry daily with escalating alerts until success or expiry.
- First-time registration from the admin page (`verifyTaxpayerInformation` then `registerDevice`) so a new branch device can be onboarded with just device ID, serial and activation key.
- Hardening: encrypt private keys and passphrases at rest (env-held master key); validate cert/key match on upload; never return key material from the API; keep the previous certificate for a short rollback window only.
- Not stated in the spec and therefore unverified: whether the old certificate is revoked immediately on reissue. Test on the test device before relying on the rollback step.

## 6. Phases
0. **Spike: done** (section 3).
1. **Certificate visibility and secret encryption: done, verified.**
   - `lib/security/secretBox.ts`: AES-256-GCM, per-value nonce, field/device bound as authenticated data, key id for rotation, fails closed without `FISCAL_ENCRYPTION_KEY`, rejects weak keys.
   - `lib/fiscalCertInfo.ts`: parse expiry/serial/subject, check cert and key match, status thresholds (warning at 60 days, critical at 30, expired).
   - Uploads now reject mismatched or expired certificates, store the key/PFX/passphrase encrypted, record parsed expiry, and write an audit event (`FiscalCertEvent`, no key material). Validation errors return 422.
   - Admin banner (admin role only) and a certificate card on Fiscal settings. Daily `/api/cron/cert-expiry` emails all admin users (or `FISCAL_ALERT_EMAILS`) at 60, 30, 14, 7, 3 and 1 days and on expiry, once each per certificate.
   - `npm run fiscal:encrypt` (dry run, `-- --apply` to write) encrypts existing plaintext rows and re-encrypts after key rotation.
   - Verified: encryption unit assertions; real-certificate parsing; end-to-end against a throwaway database (fail-closed, encrypted store, mismatch rejection, legacy row migration, audit, and a live ZIMRA test `GetConfig` using the key decrypted from the database).
2. **Device model and resolution seam: done, verified.** Deviation from the plan: the existing `FiscalSettings` document is NOT migrated; it simply stays the central device, and branch devices live in the new `FiscalDevice` collection. This makes "no override" literally the old code path.
   - `FiscalDevice` (own URL, device ID/serial, certificate, Virtual Device login, schedule), `Branch.pos.fiscalDeviceId` (null = central), `PosSale.fiscalDeviceKey`, `ZReport.fiscalDeviceKey/deviceName/deviceId`.
   - `lib/services/fiscalDevice.service.ts`: `resolveDeviceByKey / resolveDeviceForBranch / deviceKeyForBranch`, CRUD, branch assignment, certificate setters. A device never falls back to the central URL: a missing/off/incomplete device raises `DeviceConfigError` and the sale is held. Duplicate device IDs and duplicate or central URLs are rejected. Deleting is refused while a branch uses the device or it has fiscal history.
   - `lib/services/fiscalCertStore.ts`: one implementation of PEM/PFX validation and encryption shared by central and devices. Ciphertext is bound to the device (`fiscal:device:<id>:...`), so it cannot be pasted onto another device.
   - Every device call takes an optional `ResolvedDevice` (default central). The Virtual Device login token cache is keyed by URL and account.
   - A sale's device is fixed when the sale is created and never re-resolved, so reassigning a branch cannot send an already-numbered sale to another device. Credit notes go to the original's device.
   - ERP invoices always use the central device (decision 3).
   - API: `/api/admin/fiscal-devices` (list, create), `/[id]` (get, patch, delete), `/[id]/certificates`, `/[id]/sync`; `fiscalDeviceId` on `PATCH /api/pos/branches/[id]`; `deviceKey` on the fiscal-day status/open/close routes and `?deviceKey=` on Z-reports (plus `totalsByDevice`); the till status shows the branch's own device.
3. **Isolation: done, verified.** Circuit breaker and in-flight limiter keyed per device; `runPosQueue` runs each device independently and reports `devices[]`; closing a device's day only counts and retries that device's sales; the scheduler runs central plus each device on its own schedule with `Promise.allSettled`; alert keys include the device (central keeps its old keys); certificate expiry monitoring, the banner and the encrypt script cover every device.
   - Known limit: sale dates (`soldDate`, "same fiscal day") use the single `POS_TIMEZONE`; a device timezone only affects when its schedule fires. Fine while all branches are in one timezone.
   - Known gap (existing behaviour, not changed): if the scheduled *open* fails there is no retry or alert.
4. **Admin UI (next):** devices list/editor with certificate upload and sync, branch selector on POS settings, device selector on Fiscal day and Z-reports, device column on Z-report print pages.
5. **Certificate renewal: done, verified, including a real renewal on test device 31591 (2026-10-21).**
   - `lib/fiscalCsr.ts` (RSA 2048 key + CSR, CN `ZIMRA-<serial>-<10-digit id>`), `lib/zimraGateway.ts` (Gateway client; host from `zimraUseProductionUrl`, override `ZIMRA_GATEWAY_URL`; model headers per device or `ZIMRA_DEVICE_MODEL_NAME/VERSION`, default Server / v1), `lib/services/fiscalCertRenewal.service.ts`.
   - Sequence: new key stored encrypted BEFORE anything is sent; `IssueCertificate` over mTLS with the current certificate; reply checked (same device, matches our key, lasts longer); tested against ZIMRA (`GetConfig` over mTLS with the new pair) while the old one is still installed; only then swapped. If the test call fails the new pair stays pending and the next attempt installs it WITHOUT asking ZIMRA for another. A lock stops two renewals running at once (a second request would invalidate the first). The device serial is preserved across the swap.
   - Manual: "Renew now" (with a confirmation) on Fiscal settings and on each device (`POST /api/admin/fiscal-settings/renew`, `/api/admin/fiscal-devices/[id]/renew`). Automatic: the daily `/api/cron/cert-expiry` renews certificates with 30 days or fewer left, only where an admin has switched "Renew automatically" on, then emails on success or failure. Needs the certificate stored as a PEM pair (not PFX).
   - **Findings from the real renewal (these correct earlier assumptions):**
     1. ZIMRA **revokes the old certificate immediately** on reissue: the old pair got HTTP 401 right after. Anything else holding the old copy (a Virtual Device with its own certificate, the original bundle on disk) stops working at once. Because of this, **auto-renew is OFF by default** and must be switched on deliberately, and the UI warns before a manual renewal.
     2. **Validity is not a fixed year.** Device 31591's original certificate lasted a year; the renewed one lasts about six months (to 2027-04-21). Always read the real expiry from the certificate.
     3. `IssueCertificate` needs no activation key; the current certificate authenticates it. An expired certificate cannot renew (HTTP 401), so the device would have to be registered again (`RegisterDevice`, not built yet).
   - Renewed bundle for 31591 is in `certificates_31591_renewed/` (gitignored). The original `certificates_31591/` bundle is now dead (revoked).
   - Still open: whether the Axis Virtual Device uses a certificate held by this app or keeps its own. Until that is known, renewing in this app does not update a VD-held copy. `RegisterDevice` onboarding (new device from device ID + activation key) is not built.
6. **Tests and docs:** rewrite the simulation assertions per device (`pos-simulate.ts` mutates the singleton today), E2E for two devices with one down, update `POS_GO_LIVE.md`, `POS_TILL_SETUP.md`, `POS_MODULE_PLAN.md`.

## 7. Remaining questions
- Does the Axis VD enforce a vendor licence of its own? (Moot for the certificate question: the Gateway accepts our app directly.)
- Are branch devices already registered with ZIMRA (device IDs and activation keys in hand), or do we onboard them through the app?
- Same ZIMRA taxpayer for all branches (assumed)?
- Alert recipients and channel for expiry warnings (email to the existing fiscal-alert admin, or others)?
- Encryption key management: env-held master key agreed. Decide where the key is backed up (losing it means re-uploading certificates).
