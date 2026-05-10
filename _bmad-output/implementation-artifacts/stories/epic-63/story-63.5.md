# Story 63-5: Create createTestAccount fixture in modules-accounting + fix account_type_id backfills

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-5 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **a canonical createTestAccount fixture in modules-accounting**,  
So that **9 test files stop raw-INSERTing accounts and raw-UPDATEing account_type_id**.

## Context

No canonical fixture exists for creating arbitrary GL accounts. Eight or more test files raw-INSERT `accounts` rows and then raw-UPDATE `account_type_id` to fix the type after creation. This bypasses production validation and creates inconsistent test data.

**Files affected:**
1. `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts`
2. `packages/modules/accounting/__test__/integration/posting/pos-sale-reversal.test.ts`
3. `packages/modules/accounting/__test__/integration/posting/sales-payment-posting.test.ts`
4. `packages/modules/accounting/__test__/integration/posting/sales-invoice-posting.test.ts`
5. `packages/modules/accounting/__test__/integration/posting/journal-immutability.test.ts`
6. `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts`
7. `apps/api/__test__/integration/inventory/inventory-posting.test.ts`
8. `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts`
9. `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts` (has explicit TODO for this)

**Fix:**
1. Create `createTestAccount(db, { companyId, code, name, typeName, isActive? })` in `packages/modules/accounting/src/test-fixtures/account-fixtures.ts`
2. The fixture MUST go through the same validation/production path as real account creation
3. Fix existing `createTestInventoryGLAccount()` and similar helpers to set `account_type_id` at creation time (eliminates 4 backfill UPDATE sites)
4. Update all 9 affected test files to use the new fixture

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Create asset account, liability account, equity account, revenue account, expense account
- [x] **Error paths identified:** Duplicate code, invalid account type name
- [x] **Edge cases identified:** Inactive account, very long name/code
- [x] **Test fixture needs identified:** `createTestAccount` with all account types
- [x] **Integration test scope defined:** Integration tests for fixture itself + all 9 consuming tests
- [x] **Negative auth test role selected:** N/A -- fixture creation, not auth-gated

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Create asset account | Happy | Integration |
| Create liability account | Happy | Integration |
| Create expense account | Happy | Integration |
| Fix account_type_id backfill in createTestInventoryGLAccount | Happy | Integration |
| Update 9 test files to use fixture | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no new error boundaries. Test fixture using existing production paths.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-accounting`
- [x] **Cross-module decisions identified:** None -- creating test fixture in owner package
- [x] **Winston sign-off obtained:** Not required for fixture creation
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Create canonical fixture in owner package | `@jurnapod/modules-accounting` | Owner-package model | Create in apps/api (rejected: violates ownership model) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createTestAccount fixture exists in modules-accounting/test-fixtures/**
**Given** the `@jurnapod/modules-accounting` package
**When** inspecting `packages/modules/accounting/src/test-fixtures/account-fixtures.ts`
**Then** `createTestAccount(db, { companyId, code, name, typeName, isActive? })` exists and uses production validation path

**AC2: Exported from package index**
**Given** the `@jurnapod/modules-accounting` package
**When** inspecting `packages/modules/accounting/src/index.ts`
**Then** `createTestAccount` is exported

**AC3: createTestInventoryGLAccount() sets account_type_id at creation**
**Given** the existing `createTestInventoryGLAccount()` helper
**When** inspected
**Then** it sets `account_type_id` at creation time (no backfill UPDATE)

**AC4: All 9 affected files use createTestAccount**
**Given** the 9 affected test files
**When** inspected
**Then** each file imports and uses `createTestAccount` instead of raw INSERT

**AC5: 0 remaining UPDATE accounts SET account_type_id for setup**
**Given** all test files in the project
**When** searched
**Then** zero `UPDATE accounts SET account_type_id` statements exist for test setup

**AC6: All accounting test suites pass**
**Given** the accounting module
**When** all tests are executed
**Then** all accounting test suites pass

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts` | To be migrated |
| 2 | `packages/modules/accounting/__test__/integration/posting/pos-sale-reversal.test.ts` | To be migrated |
| 3 | `packages/modules/accounting/__test__/integration/posting/sales-payment-posting.test.ts` | To be migrated |
| 4 | `packages/modules/accounting/__test__/integration/posting/sales-invoice-posting.test.ts` | To be migrated |
| 5 | `packages/modules/accounting/__test__/integration/posting/journal-immutability.test.ts` | To be migrated |
| 6 | `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts` | To be migrated |
| 7 | `apps/api/__test__/integration/inventory/inventory-posting.test.ts` | To be migrated |
| 8 | `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts` | To be migrated |
| 9 | `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts` | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 9 test suites
- [ ] Happy paths to test:
  - [ ] Fixture creates accounts for all standard types
  - [ ] All 9 test files pass with new fixture
- [ ] Error paths to test:
  - [ ] Invalid account type name throws error

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Canonical GL account fixture with production path
- [x] Existing canonical fixtures reviewed: `createTestInventoryGLAccount()` exists but has backfill
- [x] Fixture location: `packages/modules/accounting/src/test-fixtures/account-fixtures.ts`

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createTestAccount(db, { companyId, code, name, typeName, isActive? })`
- [x] **Existing fixtures to update:**
  - [x] `createTestInventoryGLAccount()` -- eliminate backfill UPDATE

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: All 9 files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Examine production account creation path to understand validation requirements
- [ ] Create `packages/modules/accounting/src/test-fixtures/account-fixtures.ts`
- [ ] Implement `createTestAccount()` with production validation path
- [ ] Export from `packages/modules/accounting/src/index.ts`
- [ ] Fix `createTestInventoryGLAccount()` to set `account_type_id` at creation
- [ ] Update all 9 affected test files to import `createTestAccount`
- [ ] Remove all `UPDATE accounts SET account_type_id` from test setup
- [ ] Build `@jurnapod/modules-accounting`
- [ ] Run all 9 test suites

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/accounting/src/test-fixtures/account-fixtures.ts` | Canonical account fixture |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/index.ts` | Modify | Export `createTestAccount` |
| `packages/modules/accounting/src/test-fixtures/account-fixtures.ts` | Create | New canonical fixture |
| Various test files (9 files) | Modify | Replace raw SQL with `createTestAccount` |

## Estimated Effort

1 day

## Risk Level

Medium (P1 -- affects 9 test files, must not break existing tests)

## Dev Notes

- The fixture MUST use the same validation/production path as real account creation
- Account type resolution: `typeName` parameter maps to `account_types` table lookup
- Ensure the fixture handles inactive accounts (`isActive = false`)
- The `createTestInventoryGLAccount()` fix is critical -- 4 backfill UPDATE sites must be eliminated
- When updating test files, be careful not to change the test's intent -- just the setup method
- Some tests may create accounts with specific codes for lookup purposes -- ensure `code` parameter is supported

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

- `packages/modules/accounting/src/test-fixtures/account-fixtures.ts` (new)
- `packages/modules/accounting/src/index.ts`
- 9 affected test files (listed in AC)

## Validation Evidence

```bash
# Build package
npm run build -w @jurnapod/modules-accounting

# Verify fixture export
grep -n "createTestAccount" packages/modules/accounting/src/index.ts

# Verify no backfill UPDATEs remain
grep -rn "UPDATE accounts SET account_type_id" apps/api/__test__/ packages/modules/accounting/__test__/ || echo "PASS: no backfill UPDATEs found"

# Run accounting test suites
npm test -w @jurnapod/modules-accounting -- --run
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/accounting/
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/inventory/inventory-posting.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts
```

## Dependencies

- None -- parallel Batch 2 story
- **Blocks:** Story 63-9 (reconciliation-seeded fixtures need `createTestAccount`)

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

The `inventory-subledger-reconciliation.test.ts` file has an explicit TODO for this fixture. When updating that file, resolve the TODO comment. The `createTestInventoryGLAccount()` fix eliminates a common pattern where tests create an account and then immediately UPDATE it to set the correct type -- this is a clear sign that the fixture was incomplete.
