# Fiscal operations runbook

For the person on duty. Covers the fiscal service (`fiscal-service/`) and, where it still applies, the legacy in-app device path. Written 2026-11-05 from what was proven on the ZIMRA test gateway; the plan and evidence are in `FISCAL_SERVICE_PLAN.md`.

## 0. The five rules

1. **Never resend a receipt by hand.** The service resends the identical signed receipt itself. A second, differently numbered copy is how Gray/Red receipts are made.
2. **A Red receipt cannot be repaired by us.** ZIMRA only closes such a day manually. Prevent, do not cure.
3. **Never close a day while receipts are unsent.** The service refuses; do not use "Close anyway" unless support says so.
4. **Send nothing to a device you do not understand.** If a device shows a day you did not open, stop and read section 3.
5. **Back up the encryption key** (`FISCAL_ENCRYPTION_KEY`). Without it every stored device certificate is unreadable.

## 1. Where to look

| Need | Where |
|---|---|
| Is a day open, how many unsent, paused? | Admin > Fiscal Day (device selector) |
| Do device totals equal our sales before closing? | Fiscal Day > "Today's totals check" |
| Open problems | Fiscal Day > "Fiscal alerts" (acknowledge once handled) and the alert emails |
| Who gets alert emails | Fiscal Day > Fiscal alerts > "Who gets the alert emails" (every admin, or chosen admins, plus extra addresses). One email per alert per day |
| Service view of a device | `GET /v1/devices/:id/engine`, `/status`, `/day-counters` (bearer token) |
| Every receipt and result | service database `receipts`, raw alert log `alerts`, close attempts in the app (`fiscalCloseAttempts`) |

## 2. Alerts and what to do

| Alert kind | Meaning | Action |
|---|---|---|
| `CLOSE_FAILED` | A close was sent and ZIMRA refused or failed it | Section 4, by error code |
| `CLOSE_BLOCKED` / `CLOSE_REFUSED` | We refused to close (unsent receipts, Red/Gray, unknown receipt) | Fix the cause (section 4); the scheduler retries on its own except for permanent blocks |
| `RED_RECEIPT` | ZIMRA flagged a receipt Red. The device queue pauses and automatic close stops; the app keeps taking sales | Section 5 |
| `GRAY_RECEIPT` | A receipt before this one is missing at ZIMRA | The service resends the missing one. If it persists, section 5 |
| `RECEIPT_REFUSED` | ZIMRA refused a receipt outright; the service dropped it and renumbered the unsent ones | Find the cause in the alert text, fix the sale data, ring it again |
| `CERT_REJECTED` | ZIMRA answered 401 for the device certificate | Section 6 |
| `DAY_STATE_UNKNOWN` | The device has a day this service did not open, so its counters are unknown | Section 3 |
| `COUNTERS_REBUILT` | Saved counters differed from the receipts and were rebuilt (self-healed) | Informational; check Z-report totals agree |
| `LEASE_LOST` | A second service instance took the device | Stop the extra instance (section 8) |

## 3. A device has a day we did not open (or is stuck)

Typical sign: `DAY_STATE_UNKNOWN`, or Fiscal Day shows CloseFailed with a code nobody recognises.

1. Read-only check: `cd fiscal-service && npm run probe -- "<certs folder>" <deviceId>` prints status, last day number, last global number and any closing error.
2. If the day is `FiscalDayOpened` or `FiscalDayCloseFailed` and cannot be closed from our side, close it **on the ZIMRA operations portal** (test: `https://fdmsops.zimra.co.zw/fdms-public/close-fiscal-day`). Enter the device ID and the day number (`lastFiscalDayNo` from the probe) and press Close Day Now. The day is marked Manual.
3. Probe again: it must say `FiscalDayClosed`. Only then let the service open a new day.
4. First receipt after a manual close of a `BadCertificateSignature` day came back Red `RCPT012` once on test device 21279 (not reproduced). If it happens, the day is Red: close it on the portal and start again. Treat the first receipt after such a close with suspicion.

## 4. Closing the day: what each failure means

The guarded close drains the queue, fences new receipts, checks our last receipt number against ZIMRA's, closes, then reads the outcome from GetStatus (the close reply is only an acceptance).

| ZIMRA code | Cause | What the service does | What you do |
|---|---|---|---|
| `CountersMismatch` | The counters we signed differ from ZIMRA's | Rebuilds the counters from the stored receipts, compares, resends a bounded number of times, alerts | If it persists, our counters equal what we sent, so ZIMRA's side differs: close on the portal and send us the day's `test-output` / receipts. (Past cause, fixed 2026-11-05: credit notes were negated twice; any day with a credit note failed) |
| `BadCertificateSignature` | Wrong signing string, wrong fiscal-day date, wrong key type, clock skew | Checks the certificate and key, resends with the right format, alerts if it persists | Check the device certificate is current (section 6), server clock is correct (NTP), then portal close |
| `MissingReceipts` | A Gray gap in the chain | Finds the gap from our records, resends the identical missing receipt, retries the close | Normally none. If a receipt was lost at our side: portal close |
| `ReceiptsWithValidationErrors` | A Red receipt exists | Nothing can fix it. Auto-close stops, critical alert | Section 5 |

Always acceptable: close attempts continue until the device's maximum day length (24 h on test devices). Past that ZIMRA stops accepting receipts; close on the portal.

## 5. A Red receipt

1. Open the alert: it names the receipt and ZIMRA's validation code (e.g. `RCPT047`/`RCPT048` missing HS code, `RCPT035` credit larger than the original, `RCPT020` invalid signature).
2. Stop. Do not resend; a resend creates a second record (Gray `RCPT011` plus Red `RCPT013` seen on a real device).
3. Fix the cause in the data (HS codes must be 8 digits on every line for VAT payers; credit notes must keep the original's currency, taxes and not exceed it).
4. Close the day on the portal (section 3). The sale itself needs re-issuing as a correct invoice if the customer needs one.
5. Prevention already in place: the service checks HS codes, currency, tax ids, arithmetic in whole cents, credit-note rules and sends nothing it expects to be Red.

## 6. Certificates

- Expiry alerts are sent at 60/30/14/7/3/1 days. Test devices expire often (29203 and 29233 in early November 2026).
- **Renew** (device still works): `cd fiscal-service && npm run renew -- "<certs folder>" <deviceId> --key=rsa --yes`. **ZIMRA revokes the old certificate immediately**, so anything else holding the old copy (for example an Axis Virtual Device) stops working. The script backs up the old pair and verifies the new one before replacing files. Update the service afterwards: `PUT /v1/devices/:id/certificate`.
- **Re-register** (device returns 401, Unauthorized): 1) on the ZIMRA portal use **Reset Device Activation** (device ID and a new activation key), 2) run `ACTIVATION_KEY=<key> npx tsx scripts/register-device.ts "<certs folder>" <deviceId> <serial> --yes` yourself so the key stays in your shell, 3) the script writes `cert.crt`/`key.key`, backs up the old pair and checks the device with GetConfig, 4) upload the new pair to the service (`PUT /v1/devices/:id/certificate`). Never paste activation keys into tickets, chat or git.
- Certificates and keys live in the service database encrypted with `FISCAL_ENCRYPTION_KEY`; the `certificates_*` folders on disk are gitignored private keys, keep them off shared drives.

## 7. Outages

| Situation | Behaviour | Your action |
|---|---|---|
| ZIMRA unreachable | Sales are accepted, signed, saved, given a valid QR and queued per device; resent in strict order when ZIMRA returns | Nothing. Watch the unsent count fall to 0 before closing |
| Fiscal service down | The app prices the sale, issues a provisional slip and retries; nothing is lost | Restart the service. On start it resumes every device, repairs anything half-written, and resends identical receipts |
| App down | Tills keep selling from their own queue with leased provisional numbers | None; they sync oldest first when it returns |
| One device down | Only its branches queue; other devices carry on | None |
| Throughput | One device sustains about one receipt per second. Beyond that the device answers `DEVICE_BUSY` and the sale queues | Assign busy branches their own device |

Proven on the real test gateway on 2026-11-05: 60 sales across 4 devices and 40 on one shared device with lost replies and outages, all days closed on the first attempt with ZIMRA's count equal to ours.

## 8. The service

- Run exactly **one** instance. A database lease stops a second one writing; the loser raises `LEASE_LOST`. Do not run it on a serverless host.
- Start: `FISCAL_MONGODB_URI`, `FISCAL_MONGODB_DB`, `FISCAL_SERVICE_TOKEN` (16+ chars), `FISCAL_ENCRYPTION_KEY`, `PORT` (see `fiscal-service/.env.example`). Stop with SIGTERM so leases are released.
- The app switches with `FISCAL_BACKEND=service` plus `FISCAL_SERVICE_URL` and `FISCAL_SERVICE_TOKEN`; `legacy` (the default) is the rollback.
- Backups: the service database (receipts, day state, device registry) at least daily, and the encryption key stored separately. Restore test before go-live.
- Clock: keep the host on NTP. A wrong clock causes bad signatures and Yellow/Red date errors.

## 9. Cut-over and rollback

1. Close the legacy day on every device (Fiscal Day > Close) and confirm each shows `FiscalDayClosed` with the probe.
2. Add each device to the service (certificate + key upload), assign `serviceDeviceId` on its device record in the app admin, set the central device with `FISCAL_SERVICE_CENTRAL_DEVICE_ID`.
3. Set `FISCAL_BACKEND=service`, restart the app, open the day through the service.
4. Sell one receipt per device, check QR scans and the "Today's totals check" panel, then proceed.
5. **Rollback:** set `FISCAL_BACKEND=legacy`. Only do this with every service-managed day closed, otherwise the legacy path would find a day it did not open.

## 10. Re-running the proofs

| Test | Command |
|---|---|
| Service unit and engine tests | `cd fiscal-service && npm test` |
| Real gateway, one device, one clean day | `npx tsx scripts/e2e-live.ts "<certs>" <id> --scenario=full --yes` |
| Real gateway credit notes across two days | `npx tsx scripts/credit-live.ts "<certs>" <id> --yes` |
| Real gateway, several devices with chaos | `npx tsx scripts/real-stress.ts "<certs>" <id,id,...> --sales=60 --yes` |
| App + service + fake ZIMRA, all topologies | `npm run stress:app -- fiscal-service/scenarios/<name>.json` (`shared-device`, `per-branch-devices`, `mixed`, `app-flip-device`, `app-service-outage`, `red-receipt`, `offline-tills`) |
| App suites | `npm run test:day-status`, `test:close-guard`, `test:tills`, `test:service-backend`, `test:fiscal-alerts`, `test:vat` |

Only run the real-gateway scripts on devices whose day is closed and clean. A bad day can be closed on the ops portal (section 3), which is what made repeated runs possible.
