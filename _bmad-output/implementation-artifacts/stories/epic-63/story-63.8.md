# Story 63-8: Create treasury test fixture in modules-treasury

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-8 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **createTestCashBankTransaction fixture in modules-treasury**,  
So that **2 treasury reporting tests stop raw-INSERTing cash transactions**.

## Context

No canonical fixture exists for `createTestCashBankTransaction`. Tests raw-INSERT `cash_bank_transactions`, bypassing production validation and business logic.

**Files affected:**
1. `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts`
2. `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts`

**Fix:**
1. Create `createTestCashBankTransaction(db, opts)` in `packages/modules/treasury/test-fixtures/`
2. MUST use production cash-bank service functions
3. Update both affected files

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Create cash transaction, create bank transaction
- [x] **Error paths identified:** Invalid amount, missing account reference
- [x] **Edge cases identified:** Zero amount transaction, transaction with many line items
- [x] **Test fixture needs identified:** `createTestCashBankTransaction`
- [x] **Integration test scope defined:** Both files are integration tests
- [x] **Negative auth test role selected:** N/A -- fixture creation

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Create cash transaction | Happy | Integration |
| Create bank transaction | Happy | Integration |
| Update cash-flow test | Happy | Integration |
| Update treasury-balance test | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no new error boundaries.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-treasury`
- [x] **Cross-module decisions identified:** None
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Create fixture in owner package | `@jurnapod/modules-treasury` | Owner-package model | N/A | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createTestCashBankTransaction fixture exists**
**Given** the `@jurnapod/modules-treasury` package
**When** inspecting `packages/modules/treasury/test-fixtures/`
**Then** `createTestCashBankTransaction(db, opts)` exists and uses production service functions

**AC2: Exported from package index**
**Given** the `@jurnapod/modules-treasury` package
**When** inspecting `packages/modules/treasury/src/index.ts`
**Then** `createTestCashBankTransaction` is exported

**AC3: Both affected files use fixture**
**Given** the 2 affected test files
**When** inspected
**Then** each file imports and uses `createTestCashBankTransaction`

**AC4: Treasury test suites pass**
**Given** the treasury module
**When** all tests are executed
**Then** all treasury test suites pass

## Test Coverage Criteria

- [ ] Coverage target: All paths in 2 test suites
- [ ] Happy paths to test:
  - [ ] Fixture creates cash transaction
  - [ ] Fixture creates bank transaction
  - [ ] Both test files pass
- [ ] Error paths to test:
  - [ ] Invalid amount handled

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Cash/bank transaction canonical fixture
- [x] Existing canonical fixtures reviewed: None exist for treasury domain
- [x] Fixture location: `packages/modules/treasury/test-fixtures/`

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createTestCashBankTransaction(db, opts)`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: Both files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Examine production cash-bank transaction creation service
- [ ] Create `packages/modules/treasury/test-fixtures/cash-bank-fixtures.ts`
- [ ] Export from `packages/modules/treasury/src/index.ts`
- [ ] Update both affected test files
- [ ] Build `@jurnapod/modules-treasury`
- [ ] Run both test suites

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/treasury/test-fixtures/cash-bank-fixtures.ts` | Canonical cash/bank transaction fixture |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/treasury/src/index.ts` | Modify | Export new fixture |
| `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts` | Modify | Use createTestCashBankTransaction |
| `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` | Modify | Use createTestCashBankTransaction |

## Estimated Effort

0.5 day

## Risk Level

Low (P1 -- only 2 test files)

## Dev Notes

- `createTestCashBankTransaction` should support: `companyId`, `outletId`, `accountId`, `type` (CASH_IN/CASH_OUT/BANK_IN/BANK_OUT), `amount`, `description`, `date`
- MUST use production service functions
- Register created records in fixture registry for cleanup
- Treasury transactions often require a valid treasury account -- the fixture may need to create one or accept an account ID

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

- `packages/modules/treasury/test-fixtures/cash-bank-fixtures.ts` (new)
- `packages/modules/treasury/src/index.ts`
- 2 affected test files (listed in AC)

## Validation Evidence

```bash
# Build package
npm run build -w @jurnapod/modules-treasury

# Verify export
grep -n "createTestCashBankTransaction" packages/modules/treasury/src/index.ts

# Verify no raw SQL remains
grep -rn "INSERT INTO cash_bank_transactions" apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts || echo "PASS: no raw treasury SQL found"

# Run affected suites
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts
```

## Dependencies

- None -- parallel Batch 2 story

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

This is the smallest fixture extraction story. Treasury domain is relatively simple compared to purchasing/sales. The main consideration is ensuring the fixture creates valid treasury accounts if needed, or accepting an existing account ID parameter.
