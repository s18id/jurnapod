# Story 63-3: Replace wrong getInvoiceOpenAmount with production export

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-3 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **ap-payment-correctness.test.ts to use computePurchaseInvoiceOpenAmount from production**,  
So that **multi-currency invoice open amounts are computed correctly with exchange_rate**.

## Context

`apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts` (lines 44-61) contains an inline `getInvoiceOpenAmount()` function that reimplements `computePurchaseInvoiceOpenAmount` but **drops the `exchange_rate` multiplication**. This causes incorrect open amount calculations for non-IDR invoices.

The inline function:
```typescript
function getInvoiceOpenAmount(invoiceId: number) {
  // ... SQL query that computes total - paid but ignores exchange_rate
}
```

The production `computePurchaseInvoiceOpenAmount` correctly applies `exchange_rate` to convert foreign currency amounts to the functional currency. The test is currently asserting against wrong values for multi-currency invoices.

**Production side:** `computePurchaseInvoiceOpenAmount` exists in `packages/modules/purchasing/src/` but is not exported from the package public API (`packages/modules/purchasing/src/index.ts`).

**Fix:**
1. Export `computePurchaseInvoiceOpenAmount` from `@jurnapod/modules-purchasing` public API
2. Replace inline SQL function in test with imported production function
3. Verify multi-currency assertions are now correct

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** IDR invoice (exchange_rate=1), foreign currency invoice (exchange_rate != 1)
- [x] **Error paths identified:** Invoice not found, fully paid invoice (open amount = 0)
- [x] **Edge cases identified:** Very large exchange rates, exchange rate with many decimal places
- [x] **Test fixture needs identified:** Multi-currency purchase invoices
- [x] **Integration test scope defined:** Real DB with production posting flow
- [x] **Negative auth test role selected:** N/A -- correctness fix, not auth-gated

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| IDR invoice open amount | Happy | Integration |
| Foreign currency invoice open amount | Happy | Integration |
| Fully paid invoice open amount = 0 | Edge | Integration |
| Partial payment open amount | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- using existing production function, no new error boundaries.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-purchasing` (export addition), `apps/api` (test file)
- [x] **Cross-module decisions identified:** Export of internal function to public API
- [x] **Winston sign-off obtained:** Required -- exporting new function from package public API
- [x] **Decisions recorded:** Yes

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Export `computePurchaseInvoiceOpenAmount` from `@jurnapod/modules-purchasing` public API | `@jurnapod/modules-purchasing`, `apps/api` tests | Test needs production function to eliminate inline reimplementation | Keep inline (rejected: computes wrong amounts for multi-currency) | Required |

**Hard gate:** Export decision must be approved before implementation begins.

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: computePurchaseInvoiceOpenAmount exported from modules-purchasing**
**Given** the `@jurnapod/modules-purchasing` package
**When** inspecting `packages/modules/purchasing/src/index.ts`
**Then** `computePurchaseInvoiceOpenAmount` is exported from the public API

**AC2: Test imports and uses production function**
**Given** the `ap-payment-correctness.test.ts` file
**When** inspected
**Then** it imports `computePurchaseInvoiceOpenAmount` from `@jurnapod/modules-purchasing` and uses it instead of inline SQL

**AC3: Test assertions verified correct for multi-currency invoices**
**Given** the `ap-payment-correctness.test.ts` file
**When** executed with multi-currency invoices
**Then** open amount assertions match correctly computed values (with exchange_rate applied)

**AC4: Build passes for modules-purchasing**
**Given** the modified `@jurnapod/modules-purchasing` package
**When** built
**Then** `npm run build -w @jurnapod/modules-purchasing` passes without errors

**AC5: Full purchasing test suite passes**
**Given** the purchasing module
**When** all tests are executed
**Then** the full purchasing test suite passes

## Test Coverage Criteria

- [ ] Coverage target: All paths in ap-payment-correctness.test.ts
- [ ] Happy paths to test:
  - [ ] IDR invoice open amount computation
  - [ ] Foreign currency invoice open amount with exchange rate
  - [ ] Partial payment leaves correct open amount
- [ ] Error paths to test:
  - [ ] Invoice not found returns undefined/null
  - [ ] Fully paid invoice returns 0 open amount

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Multi-currency invoice fixtures
- [x] Existing canonical fixtures reviewed: `createTestSupplier`, existing purchasing fixtures
- [x] Fixture location: `@jurnapod/modules-purchasing` for purchasing domain

### Fixture Creation/Update
- [ ] **New fixtures needed:** None -- using existing test data
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: None
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Locate `computePurchaseInvoiceOpenAmount` in `packages/modules/purchasing/src/`
- [ ] Verify its signature and behavior (especially exchange_rate handling)
- [ ] Add export to `packages/modules/purchasing/src/index.ts`
- [ ] Build `@jurnapod/modules-purchasing` to verify export compiles
- [ ] Read `ap-payment-correctness.test.ts` and identify inline `getInvoiceOpenAmount` (lines 44-61)
- [ ] Replace inline function with import of `computePurchaseInvoiceOpenAmount`
- [ ] Verify multi-currency test assertions are correct (may need updating if previously asserting against wrong values)
- [ ] Run `ap-payment-correctness.test.ts` individually
- [ ] Run full purchasing test suite

## Files to Create

None.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/index.ts` | Modify | Export `computePurchaseInvoiceOpenAmount` |
| `apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts` | Modify | Replace inline function with production import |

## Estimated Effort

0.5 day

## Risk Level

High (P0 -- correctness fix for multi-currency calculations)

## Dev Notes

- Before replacing, verify that `computePurchaseInvoiceOpenAmount` handles the same cases as the inline function
- Check if the production function returns a different type (e.g., `bigint` vs `number`) -- update test assertions accordingly
- If the production function requires additional parameters not present in the inline version, adapt the test calls
- Multi-currency assertions may need to be updated if they were asserting against the buggy (pre-exchange_rate) values
- The inline function may be used in multiple places in the test file -- check the entire file

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

- `packages/modules/purchasing/src/index.ts`
- `apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts`

## Validation Evidence

```bash
# Verify build passes after export addition
npm run build -w @jurnapod/modules-purchasing

# Verify test passes with production function
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts

# Verify no inline getInvoiceOpenAmount remains
grep -n "function getInvoiceOpenAmount" apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts || echo "PASS: inline function removed"

# Verify import exists
grep -n "computePurchaseInvoiceOpenAmount" apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts

# Full purchasing suite
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/
```

## Dependencies

- None -- parallel Batch 1 story

## Shared Contract Changes (MANDATORY for Constants/Types)

### Blast Radius Check (E33-A1)

- [ ] Grep for all usages of the changed export in other packages
- [ ] Grep for all usages in test files
- [ ] Run consuming package tests -- all must pass
- [ ] Document any consumer files that needed updates

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `apps/api/__test__/integration/purchasing/*.test.ts` | To be tested | TBD |

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

This story is a P0 correctness fix. The inline `getInvoiceOpenAmount` function computes wrong amounts for non-IDR invoices because it ignores `exchange_rate`. All multi-currency tests in `ap-payment-correctness.test.ts` may have been asserting against wrong values. When replacing with the production function, carefully review each multi-currency assertion -- the "correct" value may now be different from what the test expected.
