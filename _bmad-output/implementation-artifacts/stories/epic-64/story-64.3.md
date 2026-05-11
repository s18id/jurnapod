# Story 64.3: Fix inventory-valuation-projection — Use getAllItemsCostSummary

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-3 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the inventory module**,  
I want **inventory valuation tests to use `getAllItemsCostSummary()` instead of inline SQL aggregation**,  
So that **tests verify against the same production valuation service the API uses**.

## Context

Epic 63 eliminated test stubs and raw SQL INSERTs. A deeper audit found that `inventory-valuation-projection.test.ts` uses a hand-rolled SQL aggregation for verification:

```sql
COALESCE(SUM(l.remaining_qty * l.unit_cost), 0)
```

`getAllItemsCostSummary()` is already imported in the test file. The test should call this production function for verification instead of duplicating the formula in SQL.

**Predecessor:** Epic 63
**Parallel batch:** Batch 1 (stories 64.1, 64.2, 64.3 — no dependencies)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Migration succeeds, valuation assertions match production output
- [ ] **Error paths identified:** None — test-only migration
- [ ] **Edge cases identified:** Zero remaining quantity, zero unit cost, multiple lots
- [ ] **Test fixture needs identified:** Existing fixtures sufficient
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Replace inline SQL with `getAllItemsCostSummary()` call | Happy | Integration |
| Verify output matches prior assertion | Edge | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes are enumerated for this story.
- [ ] Consumer catch paths validate `instanceof` checks for each producer error class.
- [ ] Consumer catch paths include `error.name` fallback handling for cross-package boundary mismatches.
- [ ] Error response mapping is deterministic across `instanceof` and `error.name` detection paths.
- [ ] Any missing fallback path is recorded and blocked before implementation starts.

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| N/A | N/A | N/A | N/A | N/A |

**Hard gate:** N/A — no cross-module error boundary for this test-only migration.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** `inventory`, `inventory-costing`
- [ ] **Cross-module decisions identified:** None — uses already-imported function
- [ ] **Winston sign-off obtained:** N/A
- [ ] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Use `getAllItemsCostSummary()` for verification | `inventory-costing` | Already imported in test, canonical formula | Inline SQL (rejected: drift risk) | N/A |

**Hard gate:** No cross-module decisions required. Implementation may proceed.

---

## Acceptance Criteria

**AC1: Inline SQL aggregation replaced with production function**
**Given** the test file `inventory-valuation-projection.test.ts`
**When** the inline `COALESCE(SUM(l.remaining_qty * l.unit_cost), 0)` is replaced
**Then** the test uses `getAllItemsCostSummary()` from `@jurnapod/modules-inventory-costing` for verification

**AC2: Test assertions remain correct**
**Given** the migrated test
**When** it runs
**Then** all assertions pass (adjust expected values if production formula computes differently, with documented rationale)

**AC3: No inline SQL aggregation remains in verification path**
**Given** the migrated test file
**When** grepped for `COALESCE(SUM` or `SUM(.*?remaining_qty`
**Then** zero matches found in verification queries

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/inventory/inventory-valuation-projection.test.ts` inline SQL | To be migrated |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing test
- [ ] Happy paths to test:
  - [ ] Test passes after migration
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

**No new fixtures needed.**

## Tasks / Subtasks

- [ ] Open `inventory-valuation-projection.test.ts`
- [ ] Locate inline SQL aggregation
- [ ] Replace with `getAllItemsCostSummary()` call
- [ ] Run test and compare output
- [ ] Adjust assertion if needed
- [ ] Verify no inline aggregation remains

## Files to Create

| File | Description |
|------|-------------|
| None | No new files |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/inventory/inventory-valuation-projection.test.ts` | Modify | Replace inline SQL with `getAllItemsCostSummary()` |

## Estimated Effort

0.5 day

## Risk Level

Low

## Dev Notes

- `getAllItemsCostSummary()` is already imported in the test file
- The function may require `companyId` and optionally `outletId`
- If the test queries specific item IDs, ensure the production function supports filtering or extract the relevant item from the summary

## Validation Evidence

- `npm run test:integration -w @jurnapod/api -- --run inventory-valuation-projection` passes
- `grep -n 'COALESCE(SUM' apps/api/__test__/integration/inventory/inventory-valuation-projection.test.ts` returns 0 results

## Dependencies

- None (service already imported)

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] No N+1 query patterns introduced
- [ ] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [ ] Integration tests included in this story's AC (not deferred)
- [ ] All new debt items added to registry before story closes

## Notes

- This is the third story in Batch 1 — all three are parallelizable.
