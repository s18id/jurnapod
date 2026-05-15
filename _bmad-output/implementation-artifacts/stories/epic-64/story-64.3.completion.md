# Story 64.3 Completion Report: Fix inventory-valuation-projection — Use getAllItemsCostSummary

**Status:** done
**Date:** 2026-05-15
**Epic:** Epic 64 — Test Production-Code Integration Phase 2
**Reviewer:** bmad-master (consolidated batch review — datetime deferral accepted)

---

## Implementation Summary

This story replaces inline SQL aggregation `COALESCE(SUM(l.remaining_qty * l.unit_cost), 0)` in `inventory-valuation-projection-reconciliation.test.ts` with the production function `getAllItemsCostSummary()` from `@jurnapod/modules-inventory-costing`. The test was pre-migrated; Batch 1 validation confirmed the replacement is correct and all tests pass.

Note: Cleanup stderr appears in logs due to FK constraint on item deletion (fixture teardown ordering); test assertions themselves pass with variance 0.0000.

---

## Files

| Action | File | Note |
|--------|------|------|
| Modified | `apps/api/__test__/integration/reporting/inventory-valuation-projection-reconciliation.test.ts` | Pre-migrated — inline SQL aggregation replaced with `getAllItemsCostSummary()` |

---

## AC Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Inline SQL aggregation replaced with production function | PASS — `COALESCE(SUM(l.remaining_qty * l.unit_cost), 0)` removed; `getAllItemsCostSummary()` in use |
| AC2 | Test assertions remain correct | PASS — all 5 tests pass; EPIC62 GATE variance 0.0000 |
| AC3 | No inline SQL aggregation remains in verification path | PASS — grep checks clean |

---

## Validation Evidence

```bash
# Focused test run
npm run test:integration -w @jurnapod/api -- --run inventory-valuation-projection

Result: Test Files 1 passed, Tests 5 passed (377ms)
EPIC62_GATE: {"variance":"0.0000"} for all assertions

Note: FK cleanup warning (test passes — teardown ordering, not test failure)
```

---

## Reviewer Sign-off

Batch 1 consolidated review GO for story scope. No P0/P1 blockers in Story 64.3 scope.
