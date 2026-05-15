# Story 64.4: Expose TrialBalanceService + Fix gl-trial-balance-reconciliation

Status: done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-4 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the accounting module**,  
I want **GL trial balance tests to use `TrialBalanceService` instead of inline SQL aggregation**,  
So that **tests verify against the same trial balance computation the API uses**.

## Context

Epic 63 eliminated test stubs. A deeper audit found that `gl-trial-balance-reconciliation.test.ts` used inline SQL aggregation:

```sql
COALESCE(SUM(debit), 0) / SUM(debit-credit)
```

at lines ~274, 311. `TrialBalanceService.getTrialBalance()` computes period-based debit/credit totals in production. The service is already exported from `@jurnapod/modules-accounting` and the test file has been pre-migrated to use it. This story requires only verification that no inline SQL remains and the test passes.

**Actual file location:** `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts`

**Predecessor:** Epic 63
**Parallel batch:** Batch 2 (stories 64.4, 64.5, 64.6, 64.7 — all require production exports)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Service exported, inline SQL replaced, test passes
- [ ] **Error paths identified:** None — test-only migration
- [ ] **Edge cases identified:** Empty trial balance, zero debits, zero credits, period boundaries
- [ ] **Test fixture needs identified:** Existing fixtures sufficient
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Export TrialBalanceService from package | Happy | Build/Integration |
| Replace inline SQL with service call | Happy | Integration |
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

- [ ] **Modules touched:** `accounting`
- [ ] **Cross-module decisions identified:** Service export boundary — should TrialBalanceService be exported from package index or a subpath?
- [ ] **Winston sign-off obtained:** Required
- [ ] **Decisions recorded:** Yes

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Export `TrialBalanceService` from `@jurnapod/modules-accounting` package index | `accounting` | Needed by tests, canonical pattern for package exports | Export from subpath only (rejected: inconsistent with other modules) | ✅ Done (pre-migrated) |
| 2 | Export constructor or factory function? | `accounting` | Determine if service requires DI container or can be instantiated directly | Factory function preferred for testability | ✅ Done (class export already used by tests) |

**Hard gate:** Satisfied via pre-migrated verification and consolidated reviewer sign-off for Batch 2.

---

## Acceptance Criteria

**AC1: TrialBalanceService exported from canonical package**
**Given** `@jurnapod/modules-accounting` package
**When** the package index is reviewed
**Then** `TrialBalanceService` (or `getTrialBalance()` factory) is exported

**AC2: Inline SQL aggregation replaced with service call**
**Given** the test file `gl-trial-balance-reconciliation.test.ts`
**When** lines ~274, 311 are reviewed
**Then** no inline `COALESCE(SUM(debit), 0)` or `SUM(debit-credit)` remains in verification paths

**AC3: Test assertions remain correct**
**Given** the migrated test
**When** it runs
**Then** all assertions pass (adjust expected values if production formula computes differently, with documented rationale)

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `packages/modules/accounting/src/index.ts` | Migrated (export already present) |
| 2 | `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` line ~274 | Migrated (uses TrialBalanceService) |
| 3 | `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` line ~311 | Migrated (uses TrialBalanceService) |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing test
- [ ] Happy paths to test:
  - [ ] Package builds with new export
  - [ ] Test passes after migration
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

**No new fixtures needed.**

## Tasks / Subtasks

- [x] `TrialBalanceService` already exported from `packages/modules/accounting/src/trial-balance/service.ts` via package index
- [x] Export strategy: class-based (already implemented)
- [x] Export already present in `packages/modules/accounting/src/index.ts` via `trial-balance/index.js`
- [x] Build package: `npm run build -w @jurnapod/modules-accounting`
- [x] Verify `gl-trial-balance-reconciliation.test.ts` uses `TrialBalanceService` (no inline SQL)
- [x] Run test and verify assertions

## Files to Create

| File | Description |
|------|-------------|
| None | No new files |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/index.ts` | No change needed | Export already present (`trial-balance/index.js`) |
| `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` | No change needed | Already uses TrialBalanceService (pre-migrated)

## Estimated Effort

1 day

## Risk Level

Medium

## Dev Notes

- `TrialBalanceService` may be a class requiring dependencies (db, companyId, fiscalYearId)
- Check the service constructor to understand required parameters
- If the service is deeply tied to HTTP context, create a thin factory that accepts Kysely instance
- Follow the pattern used by other exported services in `@jurnapod/modules-accounting`

## Validation Evidence

- `npm run build -w @jurnapod/modules-accounting` passes
- `npm run test:integration -w @jurnapod/api -- --run gl-trial-balance-reconciliation` passes
- `grep -n 'COALESCE(SUM' apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` returns 0 results

## Dependencies

- None (service exists, just needs export)

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A — no shared contract changes.

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

- Risk R64-004 applies: TrialBalanceService may not be easily exportable. If the class has complex dependencies, consider a factory function or thin wrapper.
