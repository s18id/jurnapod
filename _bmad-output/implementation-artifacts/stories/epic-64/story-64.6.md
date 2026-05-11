# Story 64.6: Expose ARReconciliationService + Fix sales-revenue-projection + ar-aging-projection

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-6 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the accounting and sales modules**,  
I want **sales revenue and AR aging tests to use `ARReconciliationService.getARSubledgerBalance()` instead of inline SQL aggregation**,  
So that **tests verify against the same AR subledger computation the API uses**.

## Context

Epic 63 eliminated test stubs. A deeper audit found inline SQL aggregation in two test files:

1. `sales-revenue-projection.test.ts` — inline GL revenue aggregation at line ~216
2. `ar-aging-projection.test.ts` — inline AR subledger aggregation at line ~115

`ARReconciliationService.getARSubledgerBalance()` computes AR subledger balances in production, but the service may not be exported from `@jurnapod/modules-accounting`. This story requires both exporting the service and replacing inline SQL in both test files.

**Predecessor:** Epic 63
**Parallel batch:** Batch 2 (stories 64.4, 64.5, 64.6, 64.7 — all require production exports)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Service exported, both test files migrated, tests pass
- [ ] **Error paths identified:** None — test-only migration
- [ ] **Edge cases identified:** Zero open invoices, multi-currency, partial payments, revenue recognition timing
- [ ] **Test fixture needs identified:** Existing fixtures sufficient
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Export ARReconciliationService from package | Happy | Build/Integration |
| Replace inline SQL in sales-revenue test | Happy | Integration |
| Replace inline SQL in ar-aging test | Happy | Integration |
| Verify outputs match prior assertions | Edge | Integration |

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

- [ ] **Modules touched:** `accounting`, `sales`
- [ ] **Cross-module decisions identified:** Service export boundary; sales-revenue test may need different service than ar-aging
- [ ] **Winston sign-off obtained:** Required
- [ ] **Decisions recorded:** Yes

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Export `ARReconciliationService` from `@jurnapod/modules-accounting` package index | `accounting` | Needed by tests, canonical pattern | Export from subpath only (rejected: inconsistent) | ⏳ Pending |
| 2 | Sales-revenue inline aggregation at line ~216: use ARReconciliationService or JournalsService? | `accounting`, `sales` | If line ~216 aggregates GL revenue accounts, JournalsService may be more appropriate | ARReconciliationService for all (rejected: may not cover GL revenue) | ⏳ Pending |

**Hard gate:** Implementation MUST NOT begin until Winston signs off on which service to use for sales-revenue projection.

---

## Acceptance Criteria

**AC1: ARReconciliationService exported from canonical package**
**Given** `@jurnapod/modules-accounting` package
**When** the package index is reviewed
**Then** `ARReconciliationService` (or `getARSubledgerBalance()` helper) is exported

**AC2: Inline SQL in sales-revenue-projection replaced**
**Given** the test file `sales-revenue-projection.test.ts`
**When** line ~216 is reviewed
**Then** no inline GL revenue aggregation remains in verification paths

**AC3: Inline SQL in ar-aging-projection replaced**
**Given** the test file `ar-aging-projection.test.ts`
**When** line ~115 is reviewed
**Then** no inline AR subledger aggregation remains in verification paths

**AC4: Test assertions remain correct**
**Given** both migrated tests
**When** they run
**Then** all assertions pass (adjust expected values if production formula computes differently, with documented rationale)

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `packages/modules/accounting/src/index.ts` | To be migrated (add export) |
| 2 | `apps/api/__test__/integration/sales/sales-revenue-projection.test.ts` line ~216 | To be migrated |
| 3 | `apps/api/__test__/integration/accounting/ar-aging-projection.test.ts` line ~115 | To be migrated |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing tests
- [ ] Happy paths to test:
  - [ ] Package builds with new export
  - [ ] Both tests pass after migration
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

**No new fixtures needed.**

## Tasks / Subtasks

- [ ] Locate `ARReconciliationService` in `packages/modules/accounting/reconciliation/subledger/`
- [ ] Determine export strategy (constructor vs factory vs static)
- [ ] Add export to `packages/modules/accounting/src/index.ts`
- [ ] Build package: `npm run build -w @jurnapod/modules-accounting`
- [ ] Open `sales-revenue-projection.test.ts`
- [ ] Replace inline SQL at line ~216 with appropriate service call
- [ ] Open `ar-aging-projection.test.ts`
- [ ] Replace inline SQL at line ~115 with `ARReconciliationService` call
- [ ] Run both tests and verify assertions

## Files to Create

| File | Description |
|------|-------------|
| None | No new files |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/index.ts` | Modify | Add `ARReconciliationService` export |
| `apps/api/__test__/integration/sales/sales-revenue-projection.test.ts` | Modify | Replace inline SQL with service call |
| `apps/api/__test__/integration/accounting/ar-aging-projection.test.ts` | Modify | Replace inline SQL with `ARReconciliationService` call |

## Estimated Effort

1 day

## Risk Level

Medium

## Dev Notes

- Risk R64-002 applies: `ARReconciliationService` may not exist as exportable class. Create thin wrapper if needed.
- The sales-revenue test at line ~216 may aggregate GL revenue accounts, not AR subledger. Verify which service is appropriate:
  - If it sums `journal_lines` for revenue accounts → use `JournalsService.getBatch()` or `TrialBalanceService`
  - If it sums AR open amounts → use `ARReconciliationService`
- Document the chosen approach in the story completion report.

## Validation Evidence

- `npm run build -w @jurnapod/modules-accounting` passes
- `npm run test:integration -w @jurnapod/api -- --run sales-revenue-projection` passes
- `npm run test:integration -w @jurnapod/api -- --run ar-aging-projection` passes
- `grep -n 'COALESCE(SUM' apps/api/__test__/integration/sales/sales-revenue-projection.test.ts apps/api/__test__/integration/accounting/ar-aging-projection.test.ts` returns 0 results

## Dependencies

- None (service exists, just needs export)

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

- This story touches two test files in different domains (sales + accounting). Pay attention to which service is appropriate for each.
