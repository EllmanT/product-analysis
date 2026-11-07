# StockFlow test users

Local/test database only. These accounts come from the seed scripts and must never exist in production.
If a login fails, re-run the script that creates it (it is safe to repeat; it resets the password).

## Quick table

| # | Email | Password | Role | Branch | Created by |
|---|-------|----------|------|--------|------------|
| 1 | `admin@testbranch.com` | `Admin@123456` | admin | none (whole store) | `npm run seed:test` or `npm run reset:test` |
| 2 | `branch@testbranch.com` | `Branch@123456` | branch_user | Test Branch | `npm run seed:test` or `npm run reset:test` |
| 3 | `cashier@harare.test` | `Cashier@123456` | cashier | Harare Street (POS on, prefix H) | `npm run pos:demo` |
| 4 | `cashier2@cranborne.test` | `Cashier@123456` | cashier | Cranborne (POS on, prefix C) | `npx tsx scripts/pos-seed-test-accounts.ts` |
| 5 | `supervisor@harare.test` | `Supervisor@123456` | branch_user | Harare Street | `npx tsx scripts/pos-seed-test-accounts.ts` |
| 6 | `supervisor2@cranborne.test` | `Supervisor@123456` | branch_user | Cranborne | `npx tsx scripts/pos-seed-test-accounts.ts` |
| 7 | `cashier3@bulawayo.test` | `Cashier@123456` | cashier | Bulawayo (POS off) | `npx tsx scripts/pos-seed-test-accounts.ts` |
| 8 | `nopassword@harare.test` | (none) | cashier | Harare Street | `npx tsx scripts/pos-seed-test-accounts.ts` |

## What each one is for

- **admin@testbranch.com**: administrator. Sees everything, including devices and fiscal-day state. Use for settings, users, devices, reports.
- **branch@testbranch.com**: ordinary branch user in "Test Branch" (store "Test Store (Playwright)"). Must stay a branch user (not auto-promoted).
- **cashier@harare.test** (Tendai Cashier): main till tester at Harare Street. Cashiers never see fiscal jargon.
- **cashier2@cranborne.test** (Rudo Cashier): second branch, own catalog and invoice prefix C. Use to check branches do not see each other's data.
- **supervisor@harare.test** (Farai Supervisor): branch user on Harare Street, to compare against the cashier's permissions.
- **supervisor2@cranborne.test** (Nyasha Supervisor): second real branch user. Branch users are not on any allow-list and must stay branch users.
- **cashier3@bulawayo.test** (Thando Cashier): branch has POS switched off. Expect a "POS not enabled" message.
- **nopassword@harare.test** (No Password): has no password account. Login must be refused with a clear message.

## Branches the scripts create

| Branch | Store | POS | Prefix | Notes |
|--------|-------|-----|--------|-------|
| Test Branch | Test Store (Playwright) | n/a | n/a | from `seed:test` |
| Harare Street | Demo Store | on | H | USD, 15.5% VAT inclusive, ZWG rate 26.5 |
| Cranborne | Demo Store | on | C | USD, 15.5% VAT inclusive |
| Bulawayo (POS off) | Demo Store | off | n/a | for the "POS not enabled" case |

## Set-up order (local)

```bash
npm run seed:test                          # users 1-2
npm run pos:demo                           # user 3 + Harare Street catalog
npx tsx scripts/pos-seed-test-accounts.ts  # users 4-8 (needs pos:demo first)
```

`npm run reset:test` wipes the test database and recreates users 1-2; run the two POS scripts again afterwards.

## Notes

- Roles in the app are `admin`, `branch_user` and `cashier`.
- `seed:test:live` / `reset:test:live` target the live database. Do not use them for testing.
- The POS scripts refuse to run when `NODE_ENV=production`.
- Section 0.3 of `docs/POS_TEST_CHECKLIST.docx` also lists test accounts; this file reflects what the scripts create.
