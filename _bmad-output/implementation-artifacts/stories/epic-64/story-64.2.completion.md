# Story 64.2 Completion Report: Fix cogs-projection-reconciliation — Use JournalsService.getJournalBatch

**Status:** done
**Date:** 2026-05-15
**Epic:** Epic 64 — Test Production-Code Integration Phase 2
**Reviewer:** bmad-master (consolidated batch review — datetime deferral accepted)

---

## Implementation Summary

This story replaces 4 inline SQL SUM aggregations in `cogs-projection-reconciliation.test.ts` with `JournalsService.getJournalBatch()` + TypeScript `.reduce()` for line summation. The test was pre-migrated; Batch 1 validation confirmed all 4 occurrences at lines ~152, 191, 215, 237 are replaced and tests pass.

Note: Cleanup stderr appears in logs due to FK constraint on item deletion (fixture teardown ordering); test assertions themselves pass with variance 0.0000.

---

## Files

| Action | File | Note |
|--------|------|------|
| Modified | `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts` | Pre-migrated — 4× `COALESCE(SUM(jl.debit), 0)` replaced with `getJournalBatch()` + TypeScript sum |

---

## AC Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | All 4 inline SQL SUM queries replaced | PASS — all 4 occurrences at lines ~152, 191, 215, 237 migrated |
| AC2 | Use JournalsService.getJournalBatch() for journal retrieval | PASS — production service used; lines summed in TypeScript |
| AC3 | Test assertions remain correct | PASS — all 5 tests pass; EPIC62 GATE variance 0.0000 |

---

## Validation Evidence

```bash
# Focused test run
npm run test:integration -w @jurnapod/api -- --run cogs-projection-reconciliation

Result: Test Files 1 passed, Tests 5 passed (449ms)
EPIC62_GATE: {"variance":"0.0000"} for all assertions

Note: FK cleanup warning (test passes — teardown ordering, not test failure)
```

---

## Reviewer Sign-off

Batch 1 consolidated review GO for story scope. No P0/P1 blockers in Story 64.2 scope.
