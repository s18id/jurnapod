# Story 63-11: Consolidate duplicate flow helpers

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-11 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **createSentPO, createPostedPI, and createSalesFixtureFlow extracted to canonical package fixtures**,  
So that **8+ files stop duplicating the same production-calling helper functions**.

## Context

Multiple test files define their own `createSentPO()`, `createPostedPI()`, and payment flow helpers. These duplicate production-calling code across 8+ files, creating maintenance burden and drift risk.

**Duplicate patterns:**
- `createSentPO()` -- defined in `goods-receipts.test.ts`, `document-chain.test.ts`, `ap-state-machine.test.ts`
- `createPostedPI()` -- defined in `ap-payment-correctness.test.ts`, and inline in several others
- `createCustomerA/createPostedInvoice/createPayment` flow -- duplicated across `treasury-reconciliation.test.ts`, `ar-credit-void-refund.test.ts`, `ar-invoice-posting.test.ts`, `payment-lifecycle.test.ts`, `invoice-lifecycle.test.ts`

**Fix:**
1. Extract `createSentPurchaseOrder` to `packages/modules/purchasing/src/test-fixtures/`
2. Extract `createPostedPurchaseInvoice` to `packages/modules/purchasing/src/test-fixtures/`
3. Extract `createSalesFixtureFlow` to `packages/modules/sales/test-fixtures/`
4. Update all 8+ files to import from canonical locations

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Extract helpers, update 8+ files, all tests pass
- [x] **Error paths identified:** Behavioral differences between inline and extracted helpers
- [x] **Edge cases identified:** Different test files may have slightly different helper variants
- [x] **Test fixture needs identified:** `createSentPurchaseOrder`, `createPostedPurchaseInvoice`, `createSalesFixtureFlow`
- [x] **Integration test scope defined:** All affected files are integration tests
- [x] **Negative auth test role selected:** N/A -- DRY consolidation

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Extract createSentPurchaseOrder | Happy | Integration |
| Extract createPostedPurchaseInvoice | Happy | Integration |
| Extract createSalesFixtureFlow | Happy | Integration |
| Update 8+ test files | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no error boundary changes.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-purchasing`, `@jurnapod/modules-sales`
- [x] **Cross-module decisions identified:** None
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Extract helpers to owner packages | purchasing, sales | Owner-package model | Keep inline (rejected: DRY violation) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createSentPurchaseOrder fixture in modules-purchasing/test-fixtures/**
**Given** the `@jurnapod/modules-purchasing` package
**When** inspecting `packages/modules/purchasing/src/test-fixtures/`
**Then** `createSentPurchaseOrder(db, opts)` exists and uses production service functions

**AC2: createPostedPurchaseInvoice fixture in modules-purchasing/test-fixtures/**
**Given** the `@jurnapod/modules-purchasing` package
**When** inspecting `packages/modules/purchasing/src/test-fixtures/`
**Then** `createPostedPurchaseInvoice(db, opts)` exists and uses production service functions

**AC3: createSalesFixtureFlow fixture in modules-sales/test-fixtures/**
**Given** the `@jurnapod/modules-sales` package
**When** inspecting `packages/modules/sales/test-fixtures/`
**Then** `createSalesFixtureFlow(db, opts)` exists and uses production service functions

**AC4: All duplicate inline helpers replaced with imports**
**Given** the 8+ affected test files
**When** inspected
**Then** zero duplicate inline `createSentPO`, `createPostedPI`, or `createSalesFixtureFlow` definitions remain

**AC5: Full test suite passes**
**Given** the full test suite
**When** executed
**Then** all tests pass

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/purchasing/goods-receipts.test.ts` (createSentPO) | To be migrated |
| 2 | `apps/api/__test__/integration/purchasing/document-chain.test.ts` (createSentPO) | To be migrated |
| 3 | `apps/api/__test__/integration/purchasing/ap-state-machine.test.ts` (createSentPO) | To be migrated |
| 4 | `apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts` (createPostedPI) | To be migrated |
| 5 | `apps/api/__test__/integration/treasury/treasury-reconciliation.test.ts` (sales flow) | To be migrated |
| 6 | `apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts` (sales flow) | To be migrated |
| 7 | `apps/api/__test__/integration/sales/ar-invoice-posting.test.ts` (sales flow) | To be migrated |
| 8 | `apps/api/__test__/integration/sales/payment-lifecycle.test.ts` (sales flow) | To be migrated |
| 9 | `apps/api/__test__/integration/sales/invoice-lifecycle.test.ts` (sales flow) | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 8+ test suites
- [ ] Happy paths to test:
  - [ ] All extracted helpers work correctly
  - [ ] All affected test files pass
- [ ] Error paths to test:
  - [ ] Behavioral differences between inline and extracted helpers

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Flow helper consolidation
- [x] Existing canonical fixtures reviewed: None for these specific flows
- [x] Fixture location: Owner packages

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createSentPurchaseOrder(db, opts)`
  - [x] `createPostedPurchaseInvoice(db, opts)`
  - [x] `createSalesFixtureFlow(db, opts)`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: All 8+ files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Identify all inline `createSentPO` definitions and compare signatures
- [ ] Identify all inline `createPostedPI` definitions and compare signatures
- [ ] Identify all inline sales flow helpers and compare signatures
- [ ] Create canonical versions in owner packages
- [ ] Export from package indexes
- [ ] Update all affected test files to import canonical versions
- [ ] Build both packages
- [ ] Run all affected test suites

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/purchasing/src/test-fixtures/flow-helpers.ts` | Purchase order flow helpers |
| `packages/modules/sales/test-fixtures/flow-helpers.ts` | Sales flow helpers |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/index.ts` | Modify | Export flow helpers |
| `packages/modules/sales/src/index.ts` | Modify | Export flow helpers |
| 8+ affected test files | Modify | Replace inline helpers with imports |

## Estimated Effort

1 day

## Risk Level

Medium (P1 -- affects 8+ files, risk of behavioral differences)

## Dev Notes

- When comparing inline helper definitions, note any behavioral differences (e.g., different default values, additional parameters)
- The canonical helper should support the union of all use cases, with optional parameters for variations
- If inline helpers have significantly different behavior, consider whether they should be separate fixtures or one fixture with options
- The `createSalesFixtureFlow` may need to support multiple scenarios (create customer, create invoice, create payment, etc.) -- consider breaking it into smaller functions if too complex
- Risk R63-004 applies: watch for circular dependencies when extracting to packages

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

- `packages/modules/purchasing/src/test-fixtures/flow-helpers.ts` (new)
- `packages/modules/sales/test-fixtures/flow-helpers.ts` (new)
- Package index files for both modules
- 8+ affected test files

## Validation Evidence

```bash
# Build packages
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-sales

# Verify exports
grep -n "createSentPurchaseOrder\|createPostedPurchaseInvoice" packages/modules/purchasing/src/index.ts
grep -n "createSalesFixtureFlow" packages/modules/sales/src/index.ts

# Verify no inline helpers remain
grep -rn "function createSentPO\|function createPostedPI\|function createCustomerA\|function createPostedInvoice\|function createPayment" apps/api/__test__/integration/purchasing/ apps/api/__test__/integration/sales/ apps/api/__test__/integration/treasury/ || echo "PASS: no inline flow helpers found"

# Run affected suites
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/sales/
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/treasury/
```

## Dependencies

- None -- parallel Batch 1 story

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

This is a DRY consolidation story. The main challenge is ensuring the canonical helper captures all variations used across test files. When in doubt, make parameters optional with sensible defaults rather than creating multiple similar helpers. Document the helper's capabilities in the fixture file comments.
