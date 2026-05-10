# Story 63-9: Create reconciliation-seeded fixtures

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-9 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **seeded fixture functions that create posted documents with journal entries via production posting**,  
So that **all reconciliation and reporting tests use production data paths**.

## Context

Reconciliation tests need deterministic journal entries. A canonical seeded fixture that goes through the production posting flow serves all reconciliation and reporting tests. This is the foundational fixture story that enables Stories 63-4 and 63-12.

**Fix:**
1. Create `createSeededPurchaseInvoice(db, opts)` in `packages/modules/purchasing/src/test-fixtures/` -- creates supplier + posted PI + journal batch/lines via production services
2. Create `createSeededSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/` -- creates customer + posted invoice + journal batch/lines via production services
3. Create `createTestJournalBatch(db, entries[])` in `packages/modules/accounting/src/test-fixtures/` for balanced journal entries
4. Update all reconciliation and reporting tests (10+ files) to use these fixtures

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Seeded PI produces balanced journal, seeded SI produces balanced journal, manual journal batch is balanced
- [x] **Error paths identified:** Posting failure, unbalanced journal entries
- [x] **Edge cases identified:** Multi-currency documents, documents with many line items
- [x] **Test fixture needs identified:** `createSeededPurchaseInvoice`, `createSeededSalesInvoice`, `createTestJournalBatch`
- [x] **Integration test scope defined:** All affected files are integration tests
- [x] **Negative auth test role selected:** N/A -- fixture creation

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Seeded PI with balanced journal | Happy | Integration |
| Seeded SI with balanced journal | Happy | Integration |
| Manual balanced journal batch | Happy | Integration |
| Update 10+ reconciliation tests | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no new error boundaries. Using existing production posting flows.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-purchasing`, `@jurnapod/modules-sales`, `@jurnapod/modules-accounting`
- [x] **Cross-module decisions identified:** None -- using existing production flows
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Create seeded fixtures in owner packages | purchasing, sales, accounting | Owner-package model | Centralized in apps/api (rejected: violates ownership) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: createSeededPurchaseInvoice produces valid balanced journal entries via production posting**
**Given** the `@jurnapod/modules-purchasing` package
**When** `createSeededPurchaseInvoice` is called
**Then** it creates a supplier, purchase invoice, posts it, and generates a balanced journal batch with correct debits and credits

**AC2: createSeededSalesInvoice produces valid balanced journal entries via production posting**
**Given** the `@jurnapod/modules-sales` package
**When** `createSeededSalesInvoice` is called
**Then** it creates a customer, sales invoice, posts it, and generates a balanced journal batch with correct debits and credits

**AC3: createTestJournalBatch produces balanced entries with correct account references**
**Given** the `@jurnapod/modules-accounting` package
**When** `createTestJournalBatch` is called with entries
**Then** it creates a journal batch where total debits equal total credits

**AC4: All reconciliation/reporting tests use seeded fixtures**
**Given** all reconciliation and reporting test files
**When** inspected
**Then** they use `createSeededPurchaseInvoice`, `createSeededSalesInvoice`, or `createTestJournalBatch`

**AC5: Reconciliation formulas produce expected results with production-seeded data**
**Given** the reconciliation test files with production-seeded data
**When** executed
**Then** all reconciliation assertions pass with expected balances

**AC6: Full test suite passes**
**Given** the full test suite
**When** executed
**Then** all tests pass

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` | To be migrated |
| 2 | `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` | To be migrated |
| 3 | `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | To be migrated |
| 4 | `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` | To be migrated |
| 5 | `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts` | To be migrated |
| 6 | `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts` | To be migrated |
| 7 | `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts` | To be migrated |
| 8 | `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts` | To be migrated |
| 9 | `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` | To be migrated |
| 10 | `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts` | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 10+ test suites
- [ ] Happy paths to test:
  - [ ] Seeded PI produces balanced journal
  - [ ] Seeded SI produces balanced journal
  - [ ] Manual journal batch is balanced
  - [ ] All reconciliation tests pass
- [ ] Error paths to test:
  - [ ] Posting failure handled
  - [ ] Unbalanced journal entries rejected

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Seeded fixtures with production posting flow
- [x] Existing canonical fixtures reviewed: Story 63-5 (accounts), 63-6 (sales), 63-7 (purchasing) fixtures
- [x] Fixture location: Owner packages (`purchasing`, `sales`, `accounting`)

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createSeededPurchaseInvoice(db, opts)` in `packages/modules/purchasing/src/test-fixtures/`
  - [x] `createSeededSalesInvoice(db, opts)` in `packages/modules/sales/test-fixtures/`
  - [x] `createTestJournalBatch(db, entries[])` in `packages/modules/accounting/src/test-fixtures/`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: 10+ files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Wait for Stories 63-5, 63-6, 63-7 to complete (dependency fixtures)
- [ ] Create `createSeededPurchaseInvoice` using production posting services
- [ ] Create `createSeededSalesInvoice` using production posting services
- [ ] Create `createTestJournalBatch` for manual balanced entries
- [ ] Export all three from respective package indexes
- [ ] Update 10+ reconciliation/reporting test files
- [ ] Build all three packages
- [ ] Run full reconciliation test suite

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/purchasing/src/test-fixtures/seeded-purchase-invoice-fixtures.ts` | Seeded purchase invoice fixture |
| `packages/modules/sales/test-fixtures/seeded-sales-invoice-fixtures.ts` | Seeded sales invoice fixture |
| `packages/modules/accounting/src/test-fixtures/journal-batch-fixtures.ts` | Manual journal batch fixture |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/index.ts` | Modify | Export seeded fixture |
| `packages/modules/sales/src/index.ts` | Modify | Export seeded fixture |
| `packages/modules/accounting/src/index.ts` | Modify | Export journal batch fixture |
| 10+ reconciliation/reporting test files | Modify | Use seeded fixtures |

## Estimated Effort

2 days

## Risk Level

High (P1 -- affects 10+ files, risk of journal balance differences per R63-001)

## Dev Notes

- **CRITICAL:** This story depends on Stories 63-5, 63-6, 63-7. Do not start until those fixtures are complete.
- The seeded fixtures are the most complex in this epic because they must:
  1. Create prerequisite entities (supplier/customer, items, accounts)
  2. Create the document (PI/SI)
  3. Post the document through production services
  4. Verify journal entries were created
- The `createTestJournalBatch` fixture should accept an array of entries with account IDs, amounts, and debit/credit flags
- Risk R63-001 applies heavily here: seeded fixtures may produce different journal balances than raw SQL. Run old and new paths in parallel to diff outputs.
- If reconciliation formulas fail after switching to production-seeded data, investigate per Story 63-4 notes.

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

- `packages/modules/purchasing/src/test-fixtures/seeded-purchase-invoice-fixtures.ts` (new)
- `packages/modules/sales/test-fixtures/seeded-sales-invoice-fixtures.ts` (new)
- `packages/modules/accounting/src/test-fixtures/journal-batch-fixtures.ts` (new)
- Package index files for all three modules
- 10+ affected test files

## Validation Evidence

```bash
# Build all packages
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-sales
npm run build -w @jurnapod/modules-accounting

# Verify exports
grep -n "createSeededPurchaseInvoice" packages/modules/purchasing/src/index.ts
grep -n "createSeededSalesInvoice" packages/modules/sales/src/index.ts
grep -n "createTestJournalBatch" packages/modules/accounting/src/index.ts

# Run all reconciliation suites
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/accounting/
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/reporting/
```

## Dependencies

- **Story 63-5** (createTestAccount) -- MUST be complete
- **Story 63-6** (sales fixtures) -- MUST be complete
- **Story 63-7** (purchasing fixtures) -- MUST be complete

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

This is the largest fixture extraction story and the foundation for Stories 63-4 and 63-12. The seeded fixtures must be rock-solid because they will be used across 10+ test files. Spend extra time ensuring:
1. Journal entries are balanced (debits = credits)
2. Account mappings match production expectations
3. Multi-currency handling is correct
4. The fixtures are deterministic (no `Date.now()` or `Math.random()` in business fields)

If the production posting services are too complex to call directly from fixtures, consider creating a simplified "test-only" posting path that still exercises the same mappers and validation but with fewer prerequisites. Document any simplifications clearly.
