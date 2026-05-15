# Story 64.7 Completion Report: Expose CashBankService Helpers + Fix cash-flow-consistency + treasury-balance-projection

**Status:** done
**Date:** 2026-05-15
**Epic:** Epic 64 — Test Production-Code Integration Phase 2
**Reviewer:** bmad-master (consolidated Batch 2 GO — datetime deferral accepted per user)

---

## Implementation Summary

This story validates that `CashBankService` helpers are correctly exported from `@jurnapod/modules-treasury` and that two test files use the service with no massive inline SQL blocks remaining:
- `cash-flow-consistency-reconciliation.test.ts` — uses `CashBankService` helpers for balance/inflow/outflow computations
- `treasury-balance-projection-reconciliation.test.ts` — uses `CashBankService.getCashBalance()`

Both test files were pre-migrated prior to Batch 2; this report confirms alignment, updated story path references, and passing tests.

---

## Files

| Action | File | Note |
|--------|------|------|
| Verified | `packages/modules/treasury/src/index.ts` | CashBankService already exported via package index |
| Verified | `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts` | Pre-migrated — uses CashBankService helpers; no massive inline SQL blocks at lines ~167-274, ~350-480, ~550-610 |
| Verified | `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` | Pre-migrated — uses `CashBankService.getCashBalance()`; no inline SQL at line ~146 |

---

## AC Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | CashBankService helpers exported from canonical package | PASS — CashBankService exported via `modules-treasury` package index |
| AC2 | Massive inline SQL in cash-flow-consistency replaced | PASS — Uses CashBankService helpers; no inline cash-flow computation SQL |
| AC3 | Inline SQL in treasury-balance-projection replaced | PASS — Uses `CashBankService.getCashBalance()`; no inline treasury balance aggregation |
| AC4 | Test assertions remain correct | PASS — All 17 tests (13 cash-flow + 4 treasury-balance) pass with zero variance |

---

## Validation Evidence

```bash
# modules-treasury build
npm run build -w @jurnapod/modules-treasury
Result: PASS (no errors)

# Focused test run (epic64-batch2-focused.log)
npm run test:integration -w @jurnapod/api -- --run cash-flow-consistency-reconciliation
Result: Test Files 1 passed, Tests 13 passed (2617ms)

npm run test:integration -w @jurnapod/api -- --run treasury-balance-projection-reconciliation
Result: Test Files 1 passed, Tests 4 passed (365ms)

All EPIC62 GATE variance: 0.0000

# Comment fix re-run (epic64-batch2-commentfix.log)
npm run test:integration -w @jurnapod/api -- --run gl-trial-balance-reconciliation cash-flow-consistency-reconciliation
Result: Test Files 2 passed, Tests 20 passed (4174ms) — clean pass after comment cleanup
```

---

## Reviewer Sign-off

Consolidated Batch 2 GO. No P0/P1 blockers. Story scope validated; datetime deferral accepted per user.