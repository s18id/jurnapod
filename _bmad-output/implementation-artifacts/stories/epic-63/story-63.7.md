# Story 63-7: Create purchasing test fixtures in modules-purchasing

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-7 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **createTestPurchaseInvoice and createTestApPayment fixtures in modules-purchasing**,  
So that **AP/reporting tests stop raw-INSERTing PIs and payments**.

## Context

Tests already have `createTestSupplier` from `@jurnapod/modules-purchasing` but aren't using it in all locations. Missing fixtures: `createTestPurchaseInvoice`, `createTestApPayment`.

**Files affected:**
1. `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts`
2. `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts`

**Fix:**
1. Create `createTestPurchaseInvoice(db, opts)` in `packages/modules/purchasing/src/test-fixtures/`
2. Create `createTestApPayment(db, opts)` in `packages/modules/purchasing/src/test-fixtures/`
3. Both MUST use production service functions
4. Replace raw SQL in affected files
5. Also replace raw `INSERT INTO suppliers` with existing `createTestSupplier` in affected files

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Create purchase invoice with defaults, create AP payment
- [x] **Error paths identified:** Duplicate invoice number, invalid payment amount
- [x] **Edge cases identified:** Invoice with zero amount, payment exceeding invoice total
- [x] **Test fixture needs identified:** `createTestPurchaseInvoice`, `createTestApPayment`
- [x] **Integration test scope defined:** All affected files are integration tests
- [x] **Negative auth test role selected:** N/A -- fixture creation

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Create purchase invoice with defaults | Happy | Integration |
| Create AP payment | Happy | Integration |
| Replace raw SQL in ap-aging test | Happy | Integration |
| Replace raw SQL in ap-subledger test | Happy | Integration |
| Use existing createTestSupplier | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no new error boundaries.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-purchasing`
- [x] **Cross-module decisions identified:** None
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Create fixtures in owner package | `@jurnapod/modules-purchasing` | Owner-package model | N/A | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createTestPurchaseInvoice fixture exists**
**Given** the `@jurnapod/modules-purchasing` package
**When** inspecting `packages/modules/purchasing/src/test-fixtures/`
**Then** `createTestPurchaseInvoice(db, opts)` exists and uses production service functions

**AC2: createTestApPayment fixture exists**
**Given** the `@jurnapod/modules-purchasing` package
**When** inspecting `packages/modules/purchasing/src/test-fixtures/`
**Then** `createTestApPayment(db, opts)` exists and uses production service functions

**AC3: Exported from package index**
**Given** the `@jurnapod/modules-purchasing` package
**When** inspecting `packages/modules/purchasing/src/index.ts`
**Then** both fixtures are exported

**AC4: Affected files use createTestSupplier + new fixtures**
**Given** the 2 affected test files
**When** inspected
**Then** each file uses `createTestSupplier` (existing) and the new fixtures

**AC5: No raw INSERT INTO suppliers/purchase_invoices/ap_payments**
**Given** the 2 affected test files
**When** inspected
**Then** zero raw `INSERT INTO suppliers`, `INSERT INTO purchase_invoices`, or `INSERT INTO ap_payments` statements exist for test setup

**AC6: Purchasing test suites pass**
**Given** the purchasing module
**When** all tests are executed
**Then** all purchasing test suites pass

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | To be migrated |
| 2 | `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 2 test suites
- [ ] Happy paths to test:
  - [ ] Fixture creates purchase invoice with defaults
  - [ ] Fixture creates AP payment
  - [ ] All affected test files pass
- [ ] Error paths to test:
  - [ ] Invalid payment amount handled

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Purchase invoice and AP payment canonical fixtures
- [x] Existing canonical fixtures reviewed: `createTestSupplier` already exists but not used everywhere
- [x] Fixture location: `packages/modules/purchasing/src/test-fixtures/`

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createTestPurchaseInvoice(db, opts)`
  - [x] `createTestApPayment(db, opts)`
- [x] **Existing fixtures to update:**
  - [x] Ensure `createTestSupplier` is used in affected files

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: Both files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Examine production purchase invoice creation service
- [ ] Examine production AP payment creation service
- [ ] Create `packages/modules/purchasing/src/test-fixtures/purchase-invoice-fixtures.ts`
- [ ] Create `packages/modules/purchasing/src/test-fixtures/ap-payment-fixtures.ts`
- [ ] Export both from `packages/modules/purchasing/src/index.ts`
- [ ] Update affected test files to use `createTestSupplier` + new fixtures
- [ ] Build `@jurnapod/modules-purchasing`
- [ ] Run affected test suites

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/purchasing/src/test-fixtures/purchase-invoice-fixtures.ts` | Canonical purchase invoice fixture |
| `packages/modules/purchasing/src/test-fixtures/ap-payment-fixtures.ts` | Canonical AP payment fixture |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/index.ts` | Modify | Export new fixtures |
| `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | Modify | Use canonical fixtures |
| `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` | Modify | Use canonical fixtures |

## Estimated Effort

1 day

## Risk Level

Medium (P1 -- affects 2 test files)

## Dev Notes

- `createTestPurchaseInvoice` should support: `companyId`, `supplierId`, `outletId`, `items[]`, `totalAmount`, `currency`, `exchangeRate`
- `createTestApPayment` should support: `companyId`, `supplierId`, `invoiceId`, `amount`, `paymentMethod`
- Both MUST use production service functions
- Register created records in fixture registry for cleanup
- The `createTestSupplier` fixture already exists -- verify it's exported and use it in affected files
- If production services require complex parameters, provide sensible defaults in the fixture

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

- `packages/modules/purchasing/src/test-fixtures/purchase-invoice-fixtures.ts` (new)
- `packages/modules/purchasing/src/test-fixtures/ap-payment-fixtures.ts` (new)
- `packages/modules/purchasing/src/index.ts`
- 2 affected test files (listed in AC)

## Validation Evidence

```bash
# Build package
npm run build -w @jurnapod/modules-purchasing

# Verify exports
grep -n "createTestPurchaseInvoice\|createTestApPayment" packages/modules/purchasing/src/index.ts

# Verify no raw SQL remains
grep -rn "INSERT INTO suppliers\|INSERT INTO purchase_invoices\|INSERT INTO ap_payments" apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts || echo "PASS: no raw purchasing SQL found"

# Run affected suites
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts
```

## Dependencies

- None -- parallel Batch 2 story
- **Blocks:** Story 63-9 (reconciliation-seeded fixtures)

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

The `createTestSupplier` fixture already exists but may not be used in all affected files. When updating the test files, ensure `createTestSupplier` is used consistently. The `createTestPurchaseInvoice` and `createTestApPayment` fixtures should support multi-currency scenarios since the affected tests include AP aging and subledger reconciliation which may involve foreign currency invoices.
