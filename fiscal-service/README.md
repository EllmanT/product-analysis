# fiscal-service

Standalone ZIMRA fiscalisation service. The POS app calls it over HTTP; it owns the devices, counters,
hash chain, signing and the ZIMRA connection. Plan: `../docs/FISCAL_SERVICE_PLAN.md`.

The signing core in `src/core` is adapted from [zimra-fdms](https://github.com/munashe-chivandire/zimra-fdms)
(MIT, see `LICENSE-zimra-fdms`). We changed: RSA signing (`src/node/key-signer.ts`; the original is ECDSA only)
and RSA CSRs (`src/core/csr.ts`).

## Adding a device

Upload the device certificate and private key (`POST /v1/devices`). There is no registration step. The service
reads the device id, serial, key type and expiry from the certificate, checks the key matches, asks ZIMRA
(`GetConfig` over mutual TLS) whether it accepts the pair, and only then stores it, with the key encrypted.

## Commands

    npm test                       unit and API tests (needs a local MongoDB for registry.test.ts)
    npm run probe -- "<certs dir>" read-only GetConfig/GetStatus for every bundle in a folder
    npm run renew -- "<certs dir>" <deviceId> [--key=rsa|ec] [--yes]   renew a certificate (revokes the old one)
    npm run e2e -- "<certs dir>" <deviceId> [--scenario=basic|full] [--yes]   live day: open, receipts, close
    npm start                      run the service (see .env.example)

## Hard-won facts from live runs (2026-10-25, ZIMRA test gateway)

- A VAT-payer taxpayer needs an 8 digit HS code on every line. Without it the receipt is accepted but flagged
  RED (RCPT047/RCPT048) and the day can then never be closed by us.
- The SubmitReceipt reply carries `validationErrors` with a colour per receipt. Stop on the first Red.
- A Red receipt cannot be replaced: resending with the same numbers makes a second record (RCPT011 Gray,
  RCPT013 Red). Prevention is the only defence.
- A receipt dated before ZIMRA's own day-open time gets a Yellow RCPT014. Wait a few seconds after OpenDay.
- Test taxpayers' tax table has no tax codes, and the first taxed line is a 5% withholding tax: pick the 15.5%
  standard rate explicitly.
