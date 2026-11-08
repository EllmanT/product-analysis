# StockFlow: instructions for Claude Code and other agents

**Start with `docs/AGENT_HANDOFF.md`.** It explains the system, how to run and test it, what the owner decided, what is unfinished, and the traps already hit. Then `docs/FISCAL_OUTAGE_RECOVERY.md` for anything fiscal.

## Rules that matter most

1. **Test environment only.** Never touch production data or a live ZIMRA device. Probe a ZIMRA test device read-only first (`cd fiscal-service && npx tsx scripts/e2e-live.ts "<certs>" <id>`); use only devices that are `FiscalDayClosed`. A RED receipt cannot be undone and the day then needs closing on the ZIMRA portal.
2. **Never** `git stash`, `git reset --hard`, `git checkout -- .` or force-push: the owner usually has uncommitted work. Stage by explicit path or by hunk. **Do not push unless asked.**
3. **Never print or commit secrets**: `.env*`, certificates and keys (`certificates_*`, `test certificates/`), activation keys, passwords.
4. **A sale must never be lost or rejected because ZIMRA or a device is down.** Everything goes through `lib/fiscal/issue.ts`; keep it that way.
5. **Cashiers see whether receipts are going through** (fiscal day and device state in the till's top bar, 2026-11-07 owner decision), but never ZIMRA error codes, tax detail or admin screens. Only administrators see device management.
6. **New API routes need an auth check** (`npm run check:guards` fails otherwise). Use `requirePermission(session, key)` from `lib/auth/role.ts`; add new menu pages to `lib/auth/permissions.ts`.
7. **Check disk (>= 5 GB) and memory before long runs.** If a run is killed for low memory, do not restart it on your own: it may have left device days open.
8. **Verify before you build on a claim**, and add a test with every change (fake-gateway tests in `fiscal-service/test` or `scripts/test-service-backend.ts`).
9. **UI changes**: use the design skills named in the owner's global instructions, keep the existing shadcn look and plain language, and check in a real browser with `npm run verify:ui`.

## Quick commands

```bash
npx tsc --noEmit                         # must print nothing
npm run check:guards                     # every non-public API route is guarded
npm run test:permissions                 # access rules
npm run test:shop-fiscal                 # shop invoices and their retry queue
npm run test:service-backend             # the app through the fiscal service (needs MongoDB)
(cd fiscal-service && npm test)          # 140 tests (needs MongoDB and openssl)
npm run verify:ui                        # 29 browser checks, app must be running
```

Rehearsal on real ZIMRA test devices: `docs/REHEARSAL_RUNBOOK.md`. Tester plan: `docs/STOCKFLOW_TEST_PLAN_v2.0.docx`.
