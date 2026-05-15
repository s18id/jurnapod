# Story 64.5 Completion Report: Expose APReconciliationService + Fix ap-aging-projection-reconciliation

**Status:** done
**Date:** 2026-05-15
**Epic:** Epic 64 — Test Production-Code Integration Phase 2
**Reviewer:** bmad-master (consolidated Batch 2 GO — datetime deferral accepted per user)

---

## Implementation Summary

This story validates that `APReconciliationService` is correctly exported from `@jurnapod/modules-accounting` and that `ap-aging-projection-reconciliation.test.ts` uses `getAPSubledgerBalance()` with no inline SQL aggregation remaining. The test file was pre-migrated prior to Batch 2; this report confirms alignment, updated story path references, and passing tests.

---

## Files

| Action | File | Note |
|--------|------|------|
| Verified | `packages/modules/accounting/src/index.ts` | Export already present via `reconciliation/subledger/index.js` |
| Verified | `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | Pre-migrated — uses `APReconciliationService.getAPSubledgerBalance()`, no inline SQL at lines ~213, ~351 |

---

## AC Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | APReconciliationService exported from canonical package | PASS — Export confirmed via `reconciliation/subledger/index.js` in package index |
| AC2 | Inline SQL aggregation replaced with service call | PASS — No `COALESCE(SUM(pi.grand_total * pi.exchange_rate), 0)` in verification paths |
| AC3 | Test assertions remain correct | PASS — All 8 tests pass with zero variance |

---

## Validation Evidence

```bash
# modules-accounting build
npm run build -w @jurnapod/modules-accounting
Result: PASS (no errors)

# Focused test run (epic64-batch2-focused.log)
npm run test:integration -w @jurnapod/api -- --run ap-aging-projection-reconciliation

Result: Test Files 1 passed, Tests 8 passed (6783ms)
All EPIC62 GATE variance: 0.0000
```

---

## Reviewer Sign-off

Consolidated Batch 2 GO. No P0/P1 blockers. Story scope validated; datetime deferral accepted per user.