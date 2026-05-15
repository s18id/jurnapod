# Story 64.6 Completion Report: Expose ARReconciliationService + Fix sales-revenue-projection + ar-aging-projection

**Status:** done
**Date:** 2026-05-15
**Epic:** Epic 64 — Test Production-Code Integration Phase 2
**Reviewer:** bmad-master (consolidated Batch 2 GO — datetime deferral accepted per user)

---

## Implementation Summary

This story validates that `ARReconciliationService` is correctly exported from `@jurnapod/modules-accounting` and that two test files use the correct production services:
- `sales-revenue-projection-reconciliation.test.ts` — uses `TrialBalanceService` with `REVENUE` account-type filter (appropriate for GL revenue aggregation)
- `ar-aging-projection-reconciliation.test.ts` — uses `ARReconciliationService.getARSubledgerBalance()` (appropriate for AR subledger)

Both test files were pre-migrated prior to Batch 2; this report confirms alignment, updated story path references, and passing tests.

---

## Files

| Action | File | Note |
|--------|------|------|
| Verified | `packages/modules/accounting/src/index.ts` | Export already present via `reconciliation/subledger/index.js` |
| Verified | `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts` | Pre-migrated — uses `TrialBalanceService` with REVENUE filter, no inline SQL at line ~216 |
| Verified | `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts` | Pre-migrated — uses `ARReconciliationService.getARSubledgerBalance()`, no inline SQL at line ~115 |

---

## AC Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | ARReconciliationService exported from canonical package | PASS — Export confirmed via `reconciliation/subledger/index.js` in package index |
| AC2 | Inline SQL in sales-revenue-projection replaced | PASS — Uses `TrialBalanceService` with `accountTypes: ['REVENUE']` filter; no inline GL revenue aggregation |
| AC3 | Inline SQL in ar-aging-projection replaced | PASS — Uses `ARReconciliationService.getARSubledgerBalance()`; no inline AR subledger aggregation |
| AC4 | Test assertions remain correct | PASS — All 15 tests (5 sales-revenue + 10 ar-aging) pass with zero variance |

---

## Validation Evidence

```bash
# modules-accounting build
npm run build -w @jurnapod/modules-accounting
Result: PASS (no errors)

# Focused test run (epic64-batch2-focused.log)
npm run test:integration -w @jurnapod/api -- --run sales-revenue-projection-reconciliation
Result: Test Files 1 passed, Tests 5 passed (4369ms)

npm run test:integration -w @jurnapod/api -- --run ar-aging-projection-reconciliation
Result: Test Files 1 passed, Tests 10 passed (3458ms) [includes 2 error-path tests]

All EPIC62 GATE variance: 0.0000
```

---

## Reviewer Sign-off

Consolidated Batch 2 GO. No P0/P1 blockers. Story scope validated; datetime deferral accepted per user.