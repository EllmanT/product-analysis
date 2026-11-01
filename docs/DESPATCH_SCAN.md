# Despatch slip → fiscal invoice → email

A cashier photographs a paper Stores Despatch Slip with a phone. The slip is read by AI and appears on the till. The cashier checks it, fiscalises it, and the customer receives the A4 tax invoice as a PDF by email. No thermal receipt is printed.

## How it works

1. **Pair.** On the till, press *Scan slip with phone* (top bar). A QR code opens `/scan?t=<token>` on the phone. The token is signed, lasts 12 hours, and only allows uploading slip photos into that branch (and till).
2. **Snap.** The phone page opens the camera, shrinks the photo to about 1800 px, and uploads it (`POST /api/scan/upload`).
3. **Read.** The server stores the photo and reads it with Claude in the background (`lib/ai/extractDespatchSlip.ts`). Lines are cleaned and matched to POS products (`lib/pos/despatchLines.ts`). Unmatched lines get HS code `99001000`.
4. **Review.** The till polls every 3 s. A *N slips ready* button opens the review screen: photo beside lines, VAT basis choice (slip prices include / exclude VAT, or use till prices), editable quantity and price, product matching, and a comparison with the slip total.
5. **Fiscalise.** *Add to sale* fills the cart. F12 is the normal fiscalise path. The sale stores `source` (scan id and slip number).
6. **Email.** If *Email the A4 tax invoice* is ticked, the sale carries an `emailRequest`. The PDF (`lib/pos/a4Pdf.ts`) is sent as soon as the sale is fiscalised; until then it waits and is retried by the fiscal queue (every minute).

## Setup checklist

| Item | Where |
| --- | --- |
| `ANTHROPIC_API_KEY` (and optional `DESPATCH_SCAN_MODEL`, default `claude-sonnet-5-5`) | Vercel env + `.env.local` |
| `AUTH_SECRET` set (signs pairing tokens) | already required by sign-in |
| SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Vercel env |
| Company name, **TIN**, **VAT number**, address, logo (https) per branch | `/pos-settings` |
| A POS product catalogue with codes matching the codes printed on slips | POS products |

An invoice is **never emailed** unless it has: company name, seller TIN, seller VAT number (when VAT is charged), buyer name, fiscal device ID, verification code and QR. The reason is stored on the sale (`emailRequest.lastError`).

## Rules the system enforces

- One slip, one invoice. The same scan, or another scan with the same slip number in the branch, is refused with *"This slip … has already been invoiced"*. Voided and failed sales don't count. Voiding an unfiscalised sale puts its slip back in the inbox.
- Two tills racing for one slip: exactly one wins (the scan is claimed atomically before the sale is created).
- The same photo uploaded twice in a branch is refused.
- All scan routes are scoped to the user's branch. Admins pass a `branchId`.
- A scan stuck in *processing* for 3 minutes (lost background job) is marked failed the next time anyone looks at it.
- The inbox shows the last 7 days. Scans (and their photos) are deleted after a year.
- Pairing tokens stop working as soon as the cashier who showed the QR is removed or moved to another branch. Changing `AUTH_SECRET` revokes every token. At most 40 uploads per hour per cashier.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Phone says *This link has expired* | Token older than 12 h, or the cashier was changed. Show a new QR. |
| Slip stays *Reading…* then fails | `ANTHROPIC_API_KEY` missing/invalid, or the function timed out. Check the scan's `processingError`. |
| *Slip could not be read* | Blurry, cropped or glare. Retake with the whole slip in frame. |
| Customer never gets the email | Check `emailRequest` on the sale: `pending` = waiting for fiscalisation (device down / previous-day sale awaiting admin approval); `failed` = see `lastError` (missing TIN/VAT, SMTP error after 6 tries, email cap of 10 per sale). Resend manually with `POST /api/pos/sales/<id>/email-pdf {"to": "…"}`. |
| *Total differs from slip* on the review screen | Usually the VAT basis is wrong (try the other option) or a line was misread. Cent differences are rounding: the till recomputes each line, the slip may not. |
| Sale rejected with *DUPLICATE_SLIP* after going offline | The slip was invoiced elsewhere while the till was offline. The queued sale is marked errored in the offline queue; an admin should clear it. |

## Tests

```
npm run test:despatch-lines     # line clean-up and product matching
npm run test:despatch-pairing   # token signing / expiry / tampering
npm run test:despatch-import    # VAT-basis conversion, total comparison
npm run test:a4-pdf             # PDF renders, multi-page, compliance check (pass a folder to keep sample PDFs)
npm run test:despatch-sale      # inbox scoping, one-invoice-per-slip, race, void, email hold (needs local MongoDB)
```

Not covered by automated tests: the Claude call itself, real SMTP delivery, and the phone/browser screens.
