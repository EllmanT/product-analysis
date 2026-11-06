# End-to-end acceptance with printed-receipt evidence: plan

Written 2026-11-06. Goal: before go-live, prove with files you can open that every kind of sale the platform makes ends as a correct fiscal receipt, with a QR code that ZIMRA recognises, including when tills are offline or ZIMRA is down. Every test run saves the receipts as PDFs in a timestamped folder.

## 1. Decisions taken (from the user, 2026-11-06)

| # | Decision |
|---|---|
| E1 | Save **both** documents per receipt: the 80 mm till slip and the A4 tax invoice, as PDFs. |
| E2 | QR checking is full: **decode the QR from the PDF**, match it to the fiscal data (device, receipt number, date, verification code) and to what the gateway returned, then **look it up on ZIMRA's public verification page** and record the answer. |
| E3 | PDFs are written by the **real-gateway runs** (e2e, credit, real-stress) and by **one acceptance run through the app** (real app code, real fiscal service, real test devices). |
| E4 | The acceptance run must cover **offline tills and a ZIMRA outage**: invoices made offline, or while ZIMRA is down, must still end up fiscalised, exactly once, on the right device, and show up as correct PDFs. |
| E5 | Slow is fine. Correctness is the point. |
| E6 | Commit in groups, fiscal work only (done: 6 commits on 2026-11-06). |

## 2. Output folder

```
test-evidence/                      (gitignored; real device data)
  <run-name>-<YYYY-MM-DD_HH-mm-ss>/
    summary.md                      pass/fail per check, counts, any problem listed first
    index.csv                       one row per receipt: invoice, device, branch, till, kind, currency, total, status,
                                    global no, counter, QR decoded, QR matches, ZIMRA lookup, files
    events.log                      what happened and when (outages, offline reconnect, retries)
    devices/<deviceId>.json         final counters, Z-report totals, close result
    <branch>/<till>/<NNN>_<invoiceNo>_<kind>/
        slip-80mm.pdf               what the till prints (provisional slip first when the sale was made offline)
        a4-invoice.pdf
        receipt.json                the sale + the gateway reply + checks for this receipt
        qr.png                      the QR as decoded from the PDF
```

Offline or outage sales get **two** documents sets in order: `01_provisional/` (what the customer was handed) then `02_fiscal/` (the final fiscal invoice), so the story is visible.

## 3. Checks per receipt (all must pass)

1. Both PDFs exist, open, and have the expected page count (slip: 1; A4: 1 for short invoices).
2. The PDF text contains the invoice number, buyer or "cash sale", currency, total, VAT, the device id, the verification code and the receipt number.
3. The QR is **decoded from the PDF** itself (not from the source data).
4. Decoded QR text equals the gateway's QR URL for that receipt, and its parts agree with the receipt: 10-digit device id, receipt date, receipt global number, 16-hex verification code (the printed verification code is derived from it).
5. The slip PDF QR and the A4 PDF QR are identical.
6. ZIMRA's public verification page, queried with the QR URL, says the invoice is valid (a short retry window is allowed because the device uploads in the background; if it is still "not found" after the window the receipt is listed as **unconfirmed**, not failed, with the time it was tried).
7. Provisional slips are clearly marked "not a fiscal tax invoice" and have **no** QR.
8. Credit notes show the original invoice number, negative amounts, and a QR of their own.
9. Ledger checks that already exist keep running: one receipt per sale, gapless counters and global numbers, no Yellow/Gray/Red, no duplicate invoice number, correct device per branch, day closed clean, Z-report equals sales.

## 4. The use cases the acceptance run must cover

Each is a named step in the run so the summary says exactly which passed.

| # | Use case | What must be true at the end |
|---|---|---|
| U1 | Normal sale, USD and ZWG, tax-inclusive and exclusive branch, with and without buyer details | One fiscal receipt, PDFs, valid QR |
| U2 | Sale with exempt and zero-rated lines mixed with standard-rated | Correct tax groups on the invoice and device counters |
| U3 | Credit note (partial, full) against an earlier sale, same day | Linked to the original, own QR, counters agree |
| U4 | Credit note against a sale from a **previous** fiscal day | Accepted; day closes |
| U5 | Branch sharing a device with another branch (several tills) | Right device id and QR on every slip, gapless counters |
| U6 | Branch with its own device | Same, in parallel with U5 |
| U7 | ZIMRA unreachable for a period while tills keep selling | Provisional slip printed at the time, fiscal invoice issued after recovery, exactly once, order preserved |
| U8 | Fiscal service down while the app keeps selling | Same as U7 |
| U9 | **Till offline** (no connection to the app): sells on leased provisional numbers, reconnects later in random order, some sends repeated | Each sale stored once, provisional number kept on its record, fiscalised once, PDFs show both documents |
| U10 | Offline till **and** ZIMRA down at the moment of reconnect | Sale waits, then fiscalises after ZIMRA returns; nothing lost or doubled |
| U11 | Sale made on the last evening and synced after the day closed | Held for administrator approval, never silently put into the wrong fiscal day |
| U12 | Close under load, with receipts still arriving | Fence works; late receipts go to the next day; zero mismatches |
| U13 | Lost reply (request reached ZIMRA, answer lost) | Identical resend, no duplicate, one receipt |
| U14 | Restart of the fiscal service mid-run | Resumes and finishes with no gaps |
| U15 | Day close, Z-report, "totals check" panel agree with the sales | All equal |

U1, U2, U3, U4, U5, U6 and U13 run against the **real test devices**. U7 to U12 and U14 need injected faults: ZIMRA cannot be switched off from here, so they run through the real service with the **chaos transport** in front of the real devices (drops, delays, outages between our service and ZIMRA), which is what `real-stress.ts` already does safely. Where a case needs a switch-off that the chaos transport cannot do (for example the app losing the service), it runs against the fake gateway and is marked as such in the summary.

## 5. Build plan (in order; each step ends with its tests and a commit)

| Step | Work | Done when |
|---|---|---|
| P1 | `scripts/evidence/receipt-evidence.ts`: render slip PDF (Chromium via Playwright) and A4 PDF (existing `renderA4Pdf`), extract text, extract the QR image from each PDF (`pdfjs-dist`), decode it (`jsqr`), compare, optional ZIMRA lookup; `scripts/test-receipt-evidence.ts` with a synthetic sale | Test passes with a deliberately wrong QR being caught |
| P2 | Converter for real-gateway runs: takes the JSON that `e2e-live`, `credit-live` and `real-stress` already save, plus the device's GetConfig taxpayer data, and writes the evidence folder | A fresh e2e on a clean device yields a full evidence folder with valid QR lookups |
| P3 | Acceptance script `scripts/acceptance-run.ts`: real app code, real service, real test devices, branches and tills set up from a scenario file, all use cases in section 4 as named steps, evidence folder + summary | Runs end to end on at least three real devices |
| P4 | Fault steps (U7 to U14) wired in via the chaos transport and the app-side outage switches | Every use case listed with PASS or a reason it was run on the fake gateway |
| P5 | Fix whatever the acceptance run finds; rerun until clean twice in a row | Two consecutive clean runs on different days |
| P6 | Wire the runbook (`FISCAL_RUNBOOK.md`) and the go-live checklist to this run (how to run, how to read the summary) | Docs updated |

## 6. Real devices available (2026-11-06)

Clean: 28892, 29203, 29234, 31591, 31728, 32160. 29233 waits for a new activation key attempt. 21279 and 30389 are in use by something else and are left alone. Certificates for 29234 (renewed 2027-05-05), 29203, 31728, 32160 (2027-05-06) are fresh.

Topology for the acceptance run: Branch A (3 tills) and Branch B (2 tills) share device 28892; Branch C (4 tills) on 29203; Branch D (2 tills) on 29234; Branch E (3 tills) on 31591 (a "VAT-exclusive" branch); devices 31728 and 32160 held back for the restart (U14) and the previous-day credit note (U4) cases.

## 7. Risks

- ZIMRA's verification page may lag the upload: lookups are retried for a window and unconfirmed receipts are reported separately.
- Real devices run about one receipt per second; a full acceptance run with a few hundred receipts takes tens of minutes. That is intended.
- A run that leaves a Red receipt makes that day unclosable by us; it can be cleared on the ZIMRA operations portal (see runbook section 3). Never run injected-fault steps that corrupt the chain against a real device.
- PDFs contain real (test) taxpayer data. The folder is gitignored and should not be shared outside the team.
