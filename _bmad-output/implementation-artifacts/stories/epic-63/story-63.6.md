# Story 63-6: Create sales test fixtures in modules-sales

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-6 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **createTestCustomer and createTestSalesInvoice fixtures in modules-sales**,  
So that **3 AR/reporting tests stop raw-INSERTing customers and invoices**.

## Context

No canonical fixtures exist for `createTestCustomer` and `createTestSalesInvoice`. Tests raw-INSERT `customers` and `sales_invoices` tables, bypassing production validation and business logic.

**Files affected:**
1. `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts`
2. `apps/api/__test__/integration/reporting/tenant-isolation-projection.test.ts`
3. `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts`

**Fix:**
1. Create `createTestCustomer(db, opts)` in `packages/modules/sales/test-fixtures/`
2. Create `createTestSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/`
3. Both MUST use production service functions (not raw SQL)
4. Update all 3 affected files to use the new fixtures

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Create customer with defaults, create sales invoice with line items
- [x] **Error paths identified:** Duplicate customer code, invalid invoice state
- [x] **Edge cases identified:** Customer with no invoices, invoice with zero amount
- [x] **Test fixture needs identified:** `createTestCustomer`, `createTestSalesInvoice`
- [x] **Integration test scope defined:** All 3 files are integration tests with real DB
- [x] **Negative auth test role selected:** N/A -- fixture creation, not auth-gated

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Create customer with defaults | Happy | Integration |
| Create sales invoice with line items | Happy | Integration |
| Update ar-aging-projection test | Happy | Integration |
| Update tenant-isolation-projection test | Happy | Integration |
| Update ar-subledger-reconciliation test | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no new error boundaries. Using existing production service functions.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-sales`
- [x] **Cross-module decisions identified:** None -- creating fixtures in owner package
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Create canonical fixtures in owner package | `@jurnapod/modules-sales` | Owner-package model | Create in apps/api (rejected: violates ownership) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createTestCustomer fixture exists in modules-sales/test-fixtures/**
**Given** the `@jurnapod/modules-sales` package
**When** inspecting `packages/modules/sales/test-fixtures/`
**Then** `createTestCustomer(db, opts)` exists and uses production service functions

**AC2: createTestSalesInvoice fixture exists in modules-sales/test-fixtures/**
**Given** the `@jurnapod/modules-sales` package
**When** inspecting `packages/modules/sales/test-fixtures/`
**Then** `createTestSalesInvoice(db, opts)` exists and uses production service functions

**AC3: Exported from package index**
**Given** the `@jurnapod/modules-sales` package
**When** inspecting `packages/modules/sales/src/index.ts`
**Then** both `createTestCustomer` and `createTestSalesInvoice` are exported

**AC4: 3 affected files use fixtures**
**Given** the 3 affected test files
**When** inspected
**Then** each file imports and uses `createTestCustomer` and/or `createTestSalesInvoice`

**AC5: No raw INSERT INTO customers/sales_invoices for setup**
**Given** the 3 affected test files
**When** inspected
**Then** zero raw `INSERT INTO customers` or `INSERT INTO sales_invoices` statements exist for test setup

**AC6: Sales test suites pass**
**Given** the sales module
**When** all tests are executed
**Then** all sales test suites pass

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts` | To be migrated |
| 2 | `apps/api/__test__/integration/reporting/tenant-isolation-projection.test.ts` | To be migrated |
| 3 | `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 3 test suites
- [ ] Happy paths to test:
  - [ ] Fixture creates customer with defaults
  - [ ] Fixture creates sales invoice with line items
  - [ ] All 3 test files pass with new fixtures
- [ ] Error paths to test:
  - [ ] Duplicate customer code handled

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Customer and sales invoice canonical fixtures
- [x] Existing canonical fixtures reviewed: None exist for sales domain
- [x] Fixture location: `packages/modules/sales/test-fixtures/`

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createTestCustomer(db, opts)`
  - [x] `createTestSalesInvoice(db, opts)`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: All 3 files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Examine production customer creation service to understand required fields
- [ ] Examine production sales invoice creation service to understand required fields
- [ ] Create `packages/modules/sales/test-fixtures/customer-fixtures.ts`
- [ ] Create `packages/modules/sales/test-fixtures/sales-invoice-fixtures.ts`
- [ ] Export both from `packages/modules/sales/src/index.ts`
- [ ] Update all 3 affected test files to use new fixtures
- [ ] Build `@jurnapod/modules-sales`
- [ ] Run all 3 test suites

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/sales/test-fixtures/customer-fixtures.ts` | Canonical customer fixture |
| `packages/modules/sales/test-fixtures/sales-invoice-fixtures.ts` | Canonical sales invoice fixture |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/sales/src/index.ts` | Modify | Export new fixtures |
| `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts` | Modify | Use createTestCustomer/createTestSalesInvoice |
| `apps/api/__test__/integration/reporting/tenant-isolation-projection.test.ts` | Modify | Use createTestCustomer/createTestSalesInvoice |
| `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` | Modify | Use createTestCustomer/createTestSalesInvoice |

## Estimated Effort

1 day

## Risk Level

Medium (P1 -- affects 3 test files)

## Dev Notes

- `createTestCustomer` should support at minimum: `companyId`, `code`, `name`, `email`, `phone`, `address`
- `createTestSalesInvoice` should support at minimum: `companyId`, `customerId`, `outletId`, `items[]`, `totalAmount`
- Both fixtures MUST use production service functions, not raw SQL
- The fixtures should register created records in the fixture registry for cleanup
- Consider what default values make sense for tests (e.g., default customer code prefix)
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

- `packages/modules/sales/test-fixtures/customer-fixtures.ts` (new)
- `packages/modules/sales/test-fixtures/sales-invoice-fixtures.ts` (new)
- `packages/modules/sales/src/index.ts`
- 3 affected test files (listed in AC)

## Validation Evidence

```bash
# Build package
npm run build -w @jurnapod/modules-sales

# Verify exports
grep -n "createTestCustomer\|createTestSalesInvoice" packages/modules/sales/src/index.ts

# Verify no raw SQL remains
grep -rn "INSERT INTO customers\|INSERT INTO sales_invoices" apps/api/__test__/integration/reporting/ apps/api/__test__/integration/accounting/ || echo "PASS: no raw sales SQL found"

# Run affected suites
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/tenant-isolation-projection.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts
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

These fixtures are foundational for sales-domain testing. The `createTestSalesInvoice` fixture should ideally support creating invoices in various states (draft, posted, paid, voided) to serve multiple test scenarios. If the production service doesn't support direct state creation, document the limitation and create additional fixtures as needed in follow-up stories.
