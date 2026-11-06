# Go-live rehearsal runbook (for a person or an AI agent)

**How to use this file.** Paste it (or attach it) into a Claude chat or Claude Code session that has access to this repository, and say:
*"Follow docs/REHEARSAL_RUNBOOK.md and run the go-live rehearsal. Ask me before anything the runbook says to ask about."*
It contains everything needed. Read sections 0 to 3 completely before running any command.

Written 2026-11-06. Repository: `product-analysis` (branch `master`). Test environment only.

---

## 0. What this is and what "done" means

The rehearsal runs the **real app code** (`createPosSale`, `fiscalisePosSale`, `runPosQueue`, `issueCreditNote`, `closeFiscalDayWithReport`) through the **real fiscal service** into **real ZIMRA TEST devices**. Between the service and ZIMRA sits a switchable fault layer, so "ZIMRA is down" can be staged on demand (we cannot make ZIMRA itself go down). Everything a customer would be handed is saved as PDFs, the QR codes are read back and looked up at ZIMRA.

Steps it proves (named S1 to S7 in its output):

| Step | Proves |
|---|---|
| S1 | Normal trading on shared and own devices, USD and ZWG, tax-inclusive and tax-exclusive, with and without a buyer |
| S2 | Credit notes |
| S3 | ZIMRA unreachable: every sale still completes at the till with a provisional slip; nothing is lost |
| S4 | Tills that are OFFLINE (no link to the app) reconnect while ZIMRA is still down |
| S5 | ZIMRA returns: everything is fiscalised exactly once, in order, with QR codes ZIMRA knows |
| S6 | The fiscal service is restarted mid-queue and resumes |
| S7 | The day closes cleanly on every device and the Z-report equals the sales |

**Done means:** the run ends with `ALL CHECKS PASSED`, `test-evidence/acceptance-<time>/summary.md` exists, and every device is left `FiscalDayClosed` (verified with the read-only probe in section 4).

**Honest status.** As of 2026-11-06 this rehearsal has **never completed end to end**. Earlier attempts were interrupted: one by an invoice-number collision (RCPT013, fixed in commit `a5aba69`) and two by the machine running out of memory. Treat a first full pass as new information, not a routine.

---

## 1. Safety rules (non-negotiable)

1. **Test devices only.** Never use a production device or database. The script always talks to the ZIMRA TEST gateway (the environment is fixed to `test` in the code), so a production certificate would simply be refused, but do not rely on that: only ever pass test devices.
2. **A RED receipt cannot be taken back.** ZIMRA flags it and the system can no longer close that device's fiscal day. The only fix is a person closing the day on the ZIMRA portal. So: probe first, use only closed and clean devices, and stop at the first RED alert (section 7).
3. **Do not stop a run midway.** Killing it leaves each device's day open, and the counters needed to close it exist only in the run's throw-away database, so the service cannot close it afterwards. If you must stop, say so to the user: the devices then need portal closes.
4. **Memory and disk.** The run needs several minutes of headroom. Require at least **5 GB free disk** (MongoDB refuses writes below 500 MB free) and ample free memory. Claude Code can kill background commands when memory is critically low. If that happens, **do not restart on your own**; report which devices were opened (their day numbers are in the output) and wait for the user.
5. **Never print or commit secrets**: certificates, private keys, activation keys, passwords, `.env*` contents, `FISCAL_ENCRYPTION_KEY`.
6. **Do not use the Axis virtual device** (`140.82.25.196:10005`). Its licence was "pending" on 2026-11-06 and it refuses every receipt. This rehearsal does not use it.
7. **Do not `git stash`, reset or force anything** in this repository: the owner often has uncommitted work. Do not push unless the user asks.
8. **Do not email real people.** The script points SMTP at a dead local port on purpose.

---

## 2. Prerequisites

Run these and report the results to the user before going further.

```bash
cd <repo root>                                  # folder that contains package.json
git status -sb                                  # note the branch and any uncommitted files (do not touch them)
node -v                                         # Node 20+ (22 tested)
df -h /c | tail -1                              # Windows: need >= 5 GB Avail
tasklist | grep -i mongod                       # MongoDB must be running (see below if not)
ls .env.local                                   # must exist (database URI, secrets). Never print it.
```

**MongoDB.** The script uses `OFFLINE_MONGODB_URI` from `.env.local` (a local MongoDB, default `mongodb://localhost:27017/`) and creates and drops its own throw-away databases (`pos_acceptance_tmp`, `fiscal_acceptance_*`). If the Windows service will not start, run from a normal terminal:
`mongod --dbpath <an empty folder> --setParameter diagnosticDataCollectionEnabled=false`.

**Dependencies.** `npm install` in the repo root and in `fiscal-service/`. `openssl` must be on the PATH for the fiscal-service tests (not needed for the rehearsal itself).

**Warm-up (strongly recommended, about 2 minutes, no ZIMRA traffic):**

```bash
npx tsc --noEmit                                # expect no output
npm run check:guards                            # expect: All non-public API routes have an auth check.
(cd fiscal-service && npm test)                 # expect: 140 pass, 0 fail
npm run test:service-backend                    # expect: All checks passed
```

If any warm-up check fails, stop and tell the user. Do not run the rehearsal on a red build.

---

## 3. Devices and certificates

### 3.1 What a device must look like

The rehearsal needs **at least three** ZIMRA TEST devices that are each:

- reachable with a **valid certificate** (the probe does not answer `Unauthorized`),
- in state **`FiscalDayClosed`** (not `FiscalDayOpened`, not `FiscalDayCloseFailed`),
- not used by anybody else right now (ask the user).

### 3.2 Devices known on 2026-11-06 (re-probe, states change)

| Device | State seen | Notes |
|---|---|---|
| 31728 | Closed (day 71), 3738 receipts | Used by the interrupted run: its **day 72 was left open and the user closed it on the portal**. Re-probe. |
| 32160 | Closed (day 32) | Live recovery check passed on it (days 31 and 32). Interrupted rehearsal opened **day 33 with a RED receipt**; the user closed it on the portal. Re-probe. |
| 31591 | Closed (day 72) | Valid certificate is the **renewed** pair (`certificates_31591_renewed`); the original is revoked. Interrupted rehearsal opened day 73 with a RED receipt; user closed it. Re-probe. |
| 28892, 29203, 29234, 30389 | Open (days 11, 21, 33, 11) | Opened by earlier tools; the service refuses a day it did not open. Usable only after the user closes the day on the portal. |
| 21279 | CloseFailed (BadCertificateSignature) | Needs a portal close. |
| 29233 | `Unauthorized` / certificate expiring | Not usable. |

The user said they have **closed the days** on the portal. That means the first three should be closed now, but **verify with the probe**, do not assume.

### 3.3 Where the certificates are

- `test certificates/certificates_<id>/` (note the space in the folder name): one folder per device with `cert.crt` and `key.key` (also a `.pfx` and a CSR you can ignore).
- `certificates_31591_renewed/` in the repo root: `cert.crt` and `key.key` for device **31591** (use this pair, not `certificates_31591/`).
- All of these are git-ignored private keys. Never commit or print them.

### 3.4 Build one certificates folder for the run

The script wants a folder containing `certificates_<zimraId>/cert.crt` and `key.key` for every device in the scenario. Make a temporary one **outside the repo** (or inside a git-ignored folder) and copy only the chosen devices:

```bash
RUN=<a temp folder outside the repo>/rehearsal-certs
mkdir -p "$RUN/certificates_31728" "$RUN/certificates_32160" "$RUN/certificates_31591"
cp "test certificates/certificates_31728/"{cert.crt,key.key} "$RUN/certificates_31728/"
cp "test certificates/certificates_32160/"{cert.crt,key.key} "$RUN/certificates_32160/"
cp certificates_31591_renewed/{cert.crt,key.key}             "$RUN/certificates_31591/"
```

(PowerShell: use `New-Item -ItemType Directory` and `Copy-Item`.)

---

## 4. Probe every device, read-only

This sends no receipts. Run it for each device id you plan to use:

```bash
cd fiscal-service
npx tsx scripts/e2e-live.ts "<certs folder>" <deviceId>
```

Expected for a usable device: a line like `Status: FiscalDayClosed, last day 71, last global no 3738`. Anything else:

| Output | Meaning | Action |
|---|---|---|
| `Status: FiscalDayOpened ...` | A day is open that this run did not open | Do not use. Ask the user to close it on the portal. |
| `Status: FiscalDayCloseFailed (...)` | A failed close | Do not use. Portal close. |
| `FdmsApiError: Unauthorized` | Certificate revoked or expired | Do not use. Find the current certificate pair or drop the device. |

Record the table of states in your report. If fewer than three devices are usable, **stop and tell the user**; do not "make do".

Optional second check that exercises the new recovery logic on ONE closed device (about 1 minute, sends two receipts, leaves the device closed):

```bash
cd fiscal-service
npx tsx scripts/recover-live.ts "<certs folder>" <deviceId>          # read only
npx tsx scripts/recover-live.ts "<certs folder>" <deviceId> --yes    # expect: RESULT: PASS
```

---

## 5. Choose or write the scenario

A scenario is JSON. Copy `fiscal-service/scenarios/acceptance-closed-devices.json` and change the device ids to the ones you probed. Shape:

```json
{
  "name": "acceptance-closed-devices",
  "seed": 2026,
  "devices":  [ { "id": "SHARED", "zimraId": 31728 }, { "id": "C", "zimraId": 32160 }, { "id": "D", "zimraId": 31591 } ],
  "branches": [
    { "name": "Harare",   "device": "SHARED", "tills": 3 },
    { "name": "Gweru",    "device": "SHARED", "tills": 2 },
    { "name": "Bulawayo", "device": "C",      "tills": 3 },
    { "name": "Mutare",   "device": "D",      "tills": 2, "taxInclusive": false }
  ],
  "phases": { "normal": 30, "credits": 6, "outage": 30, "offlineTills": 20, "afterRestart": 10 },
  "outageSeconds": 30,
  "offlineTillRate": 0.4
}
```

- Two branches on one device ("SHARED") test a shared device; a branch alone on a device tests an own device; `taxInclusive: false` tests VAT-exclusive pricing.
- `phases` are the numbers of sales per phase. Keep them small the first time.
- Other scenarios live in `fiscal-service/scenarios/` (`acceptance.json` needs four devices).

**Invoice numbers.** A device remembers every invoice number it has ever been given and refuses a repeat as **RCPT013** (a RED receipt). The script now gives every run unique branch prefixes (the branch initial, two characters from the clock, and the branch's position), so repeat runs on the same device are safe. If you are on an older checkout, update to commit `a5aba69` or later first.

---

## 6. Run it

First without `--yes` (checks the devices, sends nothing):

```bash
npm run acceptance -- --certs="<certs folder>" --scenario=fiscal-service/scenarios/<your scenario>.json
```

Expected:

```
Device 31728 (SHARED): FiscalDayClosed, last day 71, last receipt 3738 -> usable
...
All devices are usable. Run again with --yes to start the rehearsal.
```

Then for real. It takes **several minutes, probably ten or more** (it has not been timed end to end, because no run has finished yet) and prints named steps as it goes. **Run it in the background and do not poll in a loop**; read the output file when it finishes. Do not interrupt it.

```bash
npm run acceptance -- --certs="<certs folder>" --scenario=fiscal-service/scenarios/<your scenario>.json --yes
```

Useful flags: `--outage-secs=30` (shorter staged outage), `--no-lookup` (skip looking the QR codes up at ZIMRA's public site if it is unreachable from this network; say so in your report).

While it runs, expect to see lines such as `device 31728: day opened {"fiscalDayNo":72,"adopted":false}` (`adopted:false` is right: the service opened the day itself), then `S1 ...` through `S7 ...` with `PASS` or `FAIL` per check and `ALERT` lines when something is flagged.

### What success looks like

- Every step's checks print `PASS`.
- The last lines are `ALL CHECKS PASSED` and `Summary: ...\test-evidence\acceptance-<time>\summary.md`.
- No `ALERT RED_RECEIPT` appears at any point.
- The evidence folder contains `summary.md` plus per-branch folders with the slips and A4 invoices as PDFs and the QR lookup results.

### Then verify the devices are left clean

```bash
cd fiscal-service
npx tsx scripts/e2e-live.ts "<certs folder>" <deviceId>     # each must say FiscalDayClosed
```

---

## 7. If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `ALERT RED_RECEIPT ... RCPT013` | An invoice number was already used on that device (a repeat). | **Stop. Do not rerun on that device.** The day cannot be closed by the service: ask the user to close that device's day on the ZIMRA portal. Check you ran commit `a5aba69` or later. |
| `ALERT RED_RECEIPT` with another RCPT code (for example `RCPT026`, `RCPT027`) | A tax or total the gateway recomputed differently. | Stop. Report the invoice and the RCPT code. These codes are explained in `fiscal-service/src/core/errors.ts` and `docs/FISCAL_RUNBOOK.md`. The day needs a portal close. |
| `FdmsApiError: Unauthorized` | Certificate revoked or expired. | Use another device. |
| `The device's fiscal day is FiscalDayOpened and was not opened by this service` | A day open from outside. | Not usable until closed on the portal. |
| `Test device must be reachable with the fiscal day open` | You ran `pos:simulate` (the old Axis script) by mistake. | Use `npm run acceptance` instead. |
| `MongoServerError: available disk space ... is less than required minimum` | Disk is nearly full. | Free space (see section 1.4). |
| `Mongo URI is not defined` / cannot connect | `.env.local` missing or MongoDB not running. | Fix and rerun the read-only step. |
| The run is killed ("system is running low on memory") | Memory pressure. | **Do not restart.** Report which days were opened; they need portal closes. Ask the user to free memory first. |
| `S1: N sale(s) still not fiscalised after 300s` | Sales stuck. | Look at the lines above it: an `ALERT`, or the device not reachable. Do not keep waiting; report. |
| Fiscal alert email failed ("fetch failed" / "no administrator email addresses") | Harmless: email is deliberately disabled in the rehearsal. | Ignore. |

If the rehearsal finishes with failures, do **not** rerun repeatedly. Report, then ask the user.

---

## 8. After the run: report back to the user

Use this template (fill it in honestly; leave out nothing that failed):

```
Rehearsal report  (date, commit: <git rev-parse --short HEAD>)
Devices used: <ids>  (state before: <closed/day numbers>; state after: <closed/day numbers>)
Result: ALL CHECKS PASSED | N CHECK(S) FAILED | INTERRUPTED at <step>
S1 normal trading ......... PASS/FAIL  (<sales made / fiscalised>)
S2 credit notes ........... PASS/FAIL
S3 ZIMRA unreachable ...... PASS/FAIL
S4 offline tills .......... PASS/FAIL
S5 ZIMRA returns .......... PASS/FAIL
S6 service restart ........ PASS/FAIL
S7 day close + Z-report ... PASS/FAIL
RED receipts: <none | list with RCPT codes>
Devices needing a portal close: <none | ids and day numbers>
Evidence folder: test-evidence/acceptance-<time>/   (summary.md attached)
Anything surprising: <free text>
```

Do not commit the `test-evidence/` folder (it is git-ignored). Do not push. If you changed any code to get the run to pass, say exactly what and why, and let the user decide whether to commit it.

---

## 9. Background for the curious

- The rehearsal script is `scripts/acceptance-run.ts`. It starts its own fiscal service in-process (database `fiscal_acceptance_*`), registers the chosen devices with their real certificates, builds branches and tills in a throw-away app database (`pos_acceptance_tmp`), and drives the real code.
- Outage handling, the stale-day recovery, the clock correction and the shop invoice queue are described in `docs/FISCAL_OUTAGE_RECOVERY.md`. Module boundaries are in `docs/MODULES.md`. A new engineer or agent should start with `docs/AGENT_HANDOFF.md`.
- The tester-facing plan that covers this rehearsal as section 23 is `docs/STOCKFLOW_TEST_PLAN_v2.0.docx`.
