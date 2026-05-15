# Story 64.7: Expose CashBankService Helpers + Fix cash-flow-consistency + treasury-balance-projection

Status: done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-7 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the treasury module**,  
I want **cash flow and treasury balance tests to use `CashBankService` helpers instead of massive inline SQL**,  
So that **tests verify against the same treasury computation the API uses**.

## Context

Epic 63 eliminated test stubs. A deeper audit found the most complex inline SQL aggregation in the epic:

1. `cash-flow-consistency-reconciliation.test.ts` — massive inline cash-flow computation at lines ~167-274, 350-480, 550-610
2. `treasury-balance-projection-reconciliation.test.ts` — inline treasury balance at line ~146

`CashBankService` in `packages/modules/treasury/src/` provides treasury balance/transaction queries in production, but the required helpers may not be exported. This story requires:
1. Identifying which CashBankService methods compute the values the tests need
2. Exporting those helpers from `@jurnapod/modules-treasury`
3. Replacing the massive inline SQL blocks with service calls

**Predecessor:** Epic 63
**Parallel batch:** Batch 2 (stories 64.4, 64.5, 64.6, 64.7 — all require production exports)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Helpers exported, both test files migrated, tests pass
- [ ] **Error paths identified:** None — test-only migration
- [ ] **Edge cases identified:** Zero balance, multiple bank accounts, currency conversions, transaction date boundaries
- [ ] **Test fixture needs identified:** Existing fixtures sufficient
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Export CashBankService helpers from package | Happy | Build/Integration |
| Replace massive inline SQL in cash-flow test | Happy | Integration |
| Replace inline SQL in treasury-balance test | Happy | Integration |
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

- [ ] **Modules touched:** `treasury`
- [ ] **Cross-module decisions identified:** Which CashBankService methods to export; how to handle massive SQL blocks that may not map 1:1 to existing methods
- [ ] **Winston sign-off obtained:** Required
- [ ] **Decisions recorded:** Yes

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Export CashBankService helpers from `@jurnapod/modules-treasury` package index | `treasury` | Needed by tests, canonical pattern | Export from subpath only (rejected: inconsistent) | ✅ Done (pre-migrated) |
| 2 | If no single method covers the massive inline SQL, create helper function or decompose into multiple service calls? | `treasury` | Maintainability vs. test fidelity | Single monolithic helper (rejected: too specific) vs. decomposed (preferred) | ✅ Done (decomposed static helpers used) |

**Hard gate:** Satisfied via pre-migrated helper decomposition (`getCashBalance`, `getCashInflows`, `getCashOutflows`) and consolidated reviewer sign-off.

---

## Acceptance Criteria

**AC1: CashBankService helpers exported from canonical package**
**Given** `@jurnapod/modules-treasury` package
**When** the package index is reviewed
**Then** the required balance/transaction helpers are exported

**AC2: Massive inline SQL in cash-flow-consistency replaced**
**Given** the test file `cash-flow-consistency-reconciliation.test.ts`
**When** the test file is reviewed
**Then** no inline cash-flow computation SQL remains in verification paths

**AC3: Inline SQL in treasury-balance-projection replaced**
**Given** the test file `treasury-balance-projection-reconciliation.test.ts`
**When** the test file is reviewed
**Then** no inline treasury balance aggregation remains in verification paths

**AC4: Test assertions remain correct**
**Given** both migrated tests
**When** they run
**Then** all assertions pass (adjust expected values if production formula computes differently, with documented rationale)

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `packages/modules/treasury/src/index.ts` | Migrated (helpers available via CashBankService static methods) |
| 2 | `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts` | Migrated (uses CashBankService helpers) |
| 3 | `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` | Migrated (uses CashBankService.getCashBalance) |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing tests
- [ ] Happy paths to test:
  - [ ] Package builds with new exports
  - [ ] Both tests pass after migration
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

**No new fixtures needed.**

## Tasks / Subtasks

- [x] Open `cash-flow-consistency-reconciliation.test.ts` — pre-migrated, uses CashBankService helpers
- [x] Identify what each block computes (balance, inflow, outflow, net, etc.) — already done
- [x] Open `treasury-balance-projection-reconciliation.test.ts` — pre-migrated, uses CashBankService.getCashBalance
- [x] Locate `CashBankService` in `packages/modules/treasury/src/` — static helpers exist
- [x] Map test computations to existing service methods — mapped
- [x] For unmatched computations, create helper functions — N/A, all mapped
- [x] Add exports to `packages/modules/treasury/src/index.ts` — CashBankService already exported
- [x] Build package: `npm run build -w @jurnapod/modules-treasury` — passes
- [x] Replace inline SQL blocks with service/helper calls — pre-migrated
- [x] Run both tests and verify assertions — all 17 tests pass

## Files to Create

| File | Description |
|------|-------------|
| None (or helper files if needed) | |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/treasury/src/index.ts` | Modify | Document CashBankService helper exports (pre-migrated) |
| `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts` | Verify | Already uses CashBankService helpers — no inline SQL |
| `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` | Verify | Already uses CashBankService.getCashBalance — no inline SQL |

## Estimated Effort

2 days

## Risk Level

High

## Dev Notes

- Risk R64-003 applies: CashBankService may not expose balance aggregation. Be prepared to create helpers.
- The massive SQL blocks in cash-flow-consistency may compute multiple values (opening balance, inflows, outflows, net, closing balance). Decompose into:
  - `getCashFlowSummary(companyId, dateRange)` — returns structured object
  - Or individual helpers: `getTreasuryBalance()`, `getCashInflows()`, `getCashOutflows()`
- If creating new helpers, ensure they follow the same patterns as existing CashBankService methods
- Document any formula differences in the story completion report

## Validation Evidence

- `npm run build -w @jurnapod/modules-treasury` passes ✓
- `npm run test:integration -w @jurnapod/api -- --run cash-flow-consistency` passes ✓
- `npm run test:integration -w @jurnapod/api -- --run treasury-balance-projection` passes ✓
- `grep -n 'COALESCE(SUM' apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` returns 0 results ✓

## Dependencies

- None (service exists, may need new helpers)

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

- This is the most complex story in the epic. The massive inline SQL blocks may require careful decomposition.
- Consider pairing with another developer or requesting Winston's input on helper design.
- If the inline SQL is too complex to map to a single service method, document the decomposition strategy in the story file.
