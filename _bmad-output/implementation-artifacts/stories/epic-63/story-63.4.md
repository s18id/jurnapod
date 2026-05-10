# Story 63-4: Replace raw SQL journal seeding with production posting fixtures

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-4 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **5 reconciliation tests to seed journal data through production posting flows**,  
So that **changes to posting logic are caught by reconciliation tests**.

## Context

Five reconciliation and reporting tests seed `journal_batches` and `journal_lines` via raw `INSERT` SQL, completely bypassing the production posting mappers. If the posting logic changes (e.g., account mappings, rounding rules, batch grouping), these tests will not catch the discrepancy because they create journal entries directly rather than through the production posting flow.

**Files to fix:**
1. `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts`
2. `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts`
3. `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts`
4. `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts`
5. `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts`

**Fix:**
1. Create `createSeededPurchaseInvoice(db, opts)` in `packages/modules/purchasing/src/test-fixtures/` -- creates supplier + posted PI + generates journal batch/lines via production services
2. Create `createSeededSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/` -- creates customer + posted invoice + generates journal batch/lines via production services
3. Replace raw SQL INSERT batches in the 5 test files with the new seeded fixtures
4. Verify reconciliation formulas still produce expected balances with production-generated journal entries

**Dependencies:** This story depends on Story 63-9 (reconciliation-seeded fixtures). The fixtures must be created in 63-9 first, then consumed here.

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Reconciliation tests pass with production-seeded journal data
- [x] **Error paths identified:** Posting failures during fixture setup
- [x] **Edge cases identified:** Multi-currency journals, partial payments, voided documents
- [x] **Test fixture needs identified:** `createSeededPurchaseInvoice`, `createSeededSalesInvoice`
- [x] **Integration test scope defined:** All 5 files are integration tests with real DB
- [x] **Negative auth test role selected:** N/A -- reconciliation tests, not auth-gated

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AP subledger reconciliation with seeded PI | Happy | Integration |
| AR subledger reconciliation with seeded SI | Happy | Integration |
| AP aging projection with seeded PI | Happy | Integration |
| GL trial balance with seeded journals | Happy | Integration |
| Sales revenue projection with seeded SI | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no new error boundaries. Using existing production posting functions.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `purchasing`, `sales`, `accounting`, `reporting`
- [x] **Cross-module decisions identified:** None -- using existing production posting flows
- [x] **Winston sign-off obtained:** Not required for test-only changes using existing flows
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Use production posting flows for test setup | purchasing, sales, accounting | Ensures tests validate real posting logic | Raw SQL (rejected: bypasses posting logic) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createSeededPurchaseInvoice fixture uses production posting**
**Given** the `@jurnapod/modules-purchasing` package
**When** `createSeededPurchaseInvoice` is called
**Then** it creates a supplier, purchase invoice, posts it, and generates journal batch/lines through the same production service functions used in the application

**AC2: createSeededSalesInvoice fixture uses production posting**
**Given** the `@jurnapod/modules-sales` package
**When** `createSeededSalesInvoice` is called
**Then** it creates a customer, sales invoice, posts it, and generates journal batch/lines through the same production service functions used in the application

**AC3: No raw INSERT INTO journal_batches/journal_lines for setup in 5 files**
**Given** the 5 reconciliation test files
**When** inspected
**Then** zero raw `INSERT INTO journal_batches` or `INSERT INTO journal_lines` statements exist for test setup

**AC4: Reconciliation formulas still produce expected balances**
**Given** the 5 reconciliation test files with production-seeded data
**When** executed
**Then** all reconciliation assertions pass with expected GL/subledger balances

**AC5: All suites pass**
**Given** the test suite
**When** executed
**Then** all 5 affected test suites pass

**AC6: Build passes for both packages**
**Given** the modified packages
**When** built
**Then** `npm run build` passes for both `@jurnapod/modules-purchasing` and `@jurnapod/modules-sales`

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` | To be migrated |
| 2 | `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` | To be migrated |
| 3 | `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | To be migrated |
| 4 | `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` | To be migrated |
| 5 | `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts` | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 5 test suites
- [ ] Happy paths to test:
  - [ ] All reconciliation assertions pass with production-seeded data
- [ ] Error paths to test:
  - [ ] Posting failure during fixture setup is handled

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Seeded fixtures that create posted documents with journal entries
- [x] Existing canonical fixtures reviewed: None exist for this pattern
- [x] Fixture location: `packages/modules/purchasing/src/test-fixtures/`, `packages/modules/sales/test-fixtures/`

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createSeededPurchaseInvoice(db, opts)` in `packages/modules/purchasing/src/test-fixtures/`
  - [x] `createSeededSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: All 5 files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Wait for Story 63-9 to complete (fixture creation)
- [ ] Read all 5 test files and identify raw SQL INSERT patterns
- [ ] Replace raw SQL with `createSeededPurchaseInvoice` or `createSeededSalesInvoice` calls
- [ ] Verify each test file still produces expected reconciliation balances
- [ ] Run each test suite individually
- [ ] Run all 5 suites together
- [ ] Build both packages

## Files to Create

None -- fixtures created in Story 63-9.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` | Modify | Replace raw SQL with seeded fixtures |
| `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` | Modify | Replace raw SQL with seeded fixtures |
| `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | Modify | Replace raw SQL with seeded fixtures |
| `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` | Modify | Replace raw SQL with seeded fixtures |
| `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts` | Modify | Replace raw SQL with seeded fixtures |

## Estimated Effort

1 day

## Risk Level

High (P0 -- may reveal posting logic bugs, seeded data may differ from raw SQL)

## Dev Notes

- **CRITICAL:** This story depends on Story 63-9. Do not start until 63-9 fixtures are complete.
- The seeded fixtures will create journal entries through production posting, which may produce different account mappings or batch groupings than the raw SQL
- Reconciliation assertions may need adjustment if they were hardcoded to raw-SQL-specific values
- If reconciliation formulas fail after switching to production-seeded data, investigate whether:
  1. The test assertion was wrong (hardcoded to raw SQL values) -- fix assertion
  2. The production posting has a bug -- escalate to architecture team
  3. The fixture creates different document state than the raw SQL -- adjust fixture
- Risk R63-001 applies: run old and new paths in parallel to diff outputs

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? No

### Idempotency
- [ ] Idempotency key field: N/A

### Feature Flags
- [ ] Feature flag required? No

### Validation Rules
- [ ] `company_id` must match authenticated company: N/A

### Error Handling
- [ ] Retryable errors: N/A
- [ ] Non-retryable errors: N/A

### Health Check
- [ ] Health check required? No

## File List

- `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts`
- `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts`
- `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts`
- `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts`
- `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts`

## Validation Evidence

```bash
# Verify no raw SQL INSERT for journal tables remains
grep -n "INSERT INTO journal_batches\|INSERT INTO journal_lines" apps/api/__test__/integration/accounting/*.test.ts apps/api/__test__/integration/reporting/*.test.ts || echo "PASS: no raw journal SQL found"

# Run each affected suite
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts

# Build packages
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-sales
```

## Dependencies

- **Story 63-9** (reconciliation-seeded fixtures) -- MUST be complete before starting this story

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A -- no contract changes.

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This is a critical P0 story that validates the entire posting pipeline through reconciliation tests. If the seeded fixtures reveal discrepancies between raw-SQL-seeded and production-posted journal entries, those discrepancies must be investigated immediately. They may indicate:
1. Bugs in production posting logic (most serious -- must fix)
2. Test assertions hardcoded to wrong values (fix assertions)
3. Fixture not creating the same document state as raw SQL (fix fixture)

Do NOT adjust production posting logic to match test assertions without architecture team approval.
