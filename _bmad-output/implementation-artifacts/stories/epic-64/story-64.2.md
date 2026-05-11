# Story 64.2: Fix cogs-projection-reconciliation — Use JournalsService.getBatch

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-2 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the accounting module**,  
I want **COGS projection tests to use `JournalsService.getBatch()` instead of inline SQL SUM**,  
So that **tests verify against the same journal batch the API uses**.

## Context

Epic 63 eliminated test stubs and raw SQL INSERTs. A deeper audit found that `cogs-projection-reconciliation.test.ts` repeats inline SQL aggregation 4 times:

```sql
SELECT CAST(COALESCE(SUM(jl.debit), 0) AS DECIMAL(18,4))
```

at lines ~152, 191, 215, 237. This duplicates what `JournalsService.getBatch(batchId)` already returns (the full journal batch with lines). The test should use the production service to fetch the batch, then sum lines in TypeScript.

**Predecessor:** Epic 63
**Parallel batch:** Batch 1 (stories 64.1, 64.2, 64.3 — no dependencies)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Migration succeeds, all 4 inline queries replaced
- [ ] **Error paths identified:** None — test-only migration
- [ ] **Edge cases identified:** Empty journal batch, zero debit/credit lines, partial batches
- [ ] **Test fixture needs identified:** Existing fixtures sufficient
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Replace 4 inline SUM queries with `getBatch()` + TypeScript sum | Happy | Integration |
| Verify TypeScript sum matches prior SQL sum | Edge | Integration |

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

- [ ] **Modules touched:** `accounting`
- [ ] **Cross-module decisions identified:** None — uses already-available service
- [ ] **Winston sign-off obtained:** N/A
- [ ] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Use `JournalsService.getBatch()` + TypeScript sum | `accounting` | Production service available, eliminates SQL duplication | Keep inline SQL (rejected: drift risk) | N/A |

**Hard gate:** No cross-module decisions required. Implementation may proceed.

---

## Acceptance Criteria

**AC1: All 4 inline SQL SUM queries replaced**
**Given** the test file `cogs-projection-reconciliation.test.ts`
**When** lines ~152, 191, 215, 237 are reviewed
**Then** no inline `COALESCE(SUM(jl.debit), 0)` remains in verification paths

**AC2: Use JournalsService.getBatch() for journal retrieval**
**Given** the migrated test
**When** journal batch data is needed
**Then** `JournalsService.getBatch(batchId)` is called and lines are summed in TypeScript

**AC3: Test assertions remain correct**
**Given** the migrated test
**When** it runs
**Then** all assertions pass (adjust expected values if needed, with documented rationale)

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/accounting/cogs-projection-reconciliation.test.ts` line ~152 | To be migrated |
| 2 | `apps/api/__test__/integration/accounting/cogs-projection-reconciliation.test.ts` line ~191 | To be migrated |
| 3 | `apps/api/__test__/integration/accounting/cogs-projection-reconciliation.test.ts` line ~215 | To be migrated |
| 4 | `apps/api/__test__/integration/accounting/cogs-projection-reconciliation.test.ts` line ~237 | To be migrated |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing test
- [ ] Happy paths to test:
  - [ ] All 4 assertions pass after migration
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

**No new fixtures needed.**

## Tasks / Subtasks

- [ ] Open `cogs-projection-reconciliation.test.ts`
- [ ] Locate all 4 inline `COALESCE(SUM(jl.debit), 0)` queries
- [ ] Replace each with `JournalsService.getBatch(batchId)` call + TypeScript `.reduce()` or `.sum()`
- [ ] Run test and verify all 4 assertions pass
- [ ] Document any assertion adjustments

## Files to Create

| File | Description |
|------|-------------|
| None | No new files |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/accounting/cogs-projection-reconciliation.test.ts` | Modify | Replace 4 inline SUM queries with `JournalsService.getBatch()` |

## Estimated Effort

0.5 day

## Risk Level

Low

## Dev Notes

- `JournalsService.getBatch(batchId)` returns the full journal batch with lines array
- Sum in TypeScript: `batch.lines.reduce((sum, l) => sum + Number(l.debit), 0)`
- Use `toScaled4()` or equivalent if the production service already returns scaled values
- If lines are returned as strings (DECIMAL), use `Number()` or keep as string comparison

## Validation Evidence

- `npm run test:integration -w @jurnapod/api -- --run cogs-projection-reconciliation` passes
- `grep -n 'COALESCE(SUM' apps/api/__test__/integration/accounting/cogs-projection-reconciliation.test.ts` returns 0 results

## Dependencies

- None (service already available)

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

- The 4 repetitions of the same query pattern suggest a helper function opportunity, but keep scope focused on migration only.
