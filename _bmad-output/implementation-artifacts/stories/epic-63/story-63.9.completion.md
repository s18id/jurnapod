# Story 63.9 Completion Report: Create reconciliation-seeded fixtures

**Story:** Create reconciliation-seeded fixtures  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Created seeded fixture functions that produce posted documents with journal entries through the PRODUCTION POSTING FLOW. `createSeededPurchaseInvoice` uses `PurchaseInvoiceService.postPI()` — the exact same posting engine as production. `createSeededSalesInvoice` uses `JournalsService.createManualEntry()`. `createTestJournalBatch` produces balanced journal entries through `JournalsService`.

---

## Files

| Action | File | Description |
|--------|------|-------------|
| Created | `packages/modules/purchasing/src/test-fixtures/seeded-purchase-invoice-fixtures.ts` | `createSeededPurchaseInvoice()` — supplier + accounts + draft PI + `postPI()` |
| Created | `packages/modules/accounting/src/test-fixtures/journal-fixtures.ts` | `createTestJournalBatch()` — balanced entries via `JournalsService` |
| Created | `apps/api/src/lib/test-fixtures-seeded.ts` | `createSeededSalesInvoice()` — customer + invoice + journal via `JournalsService` |
| Modified | `packages/modules/accounting/src/journals-service.ts` | Added optional `opts?: { docType?, docId? }` to `createManualEntry()` |
| Modified | `packages/modules/purchasing/src/test-fixtures/index.ts` | Export seeded fixture |
| Modified | `packages/modules/accounting/src/test-fixtures/index.ts` | Export journal fixture |
| Modified | `apps/api/__test__/fixtures/index.ts` | Export `createSeededSalesInvoice` |
| Modified | `ar-subledger-reconciliation.test.ts` | Raw SQL → `createSeededSalesInvoice()` |
| Modified | `gl-trial-balance-reconciliation.test.ts` | Raw SQL → `createTestAccount()` + `createTestJournalBatch()` |
| Modified | `sales-revenue-projection-reconciliation.test.ts` | Raw SQL → `createTestJournalBatch()` |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `createSeededPurchaseInvoice` produces balanced journal via `PurchaseInvoiceService.postPI()` | ✅ |
| AC2 | `createSeededSalesInvoice` produces balanced journal via `JournalsService` | ✅ |
| AC3 | `createTestJournalBatch` validates debit=credit via `JournalsService` | ✅ |
| AC4 | Reconciliation/reporting tests use seeded fixtures | ✅ 3 files updated |
| AC5 | Reconciliation formulas produce expected results | ✅ variance = 0.0000 |
| AC6 | Full affected test suite passes | ✅ 66 tests across 9 files |

## Test Results

```
ar-subledger-reconciliation:              18 passed
ap-subledger-reconciliation:              19 passed
gl-trial-balance-reconciliation:           7 passed
sales-revenue-projection-reconciliation:   5 passed
ap-aging-projection-reconciliation:        8 passed
ar-aging-projection-reconciliation:       10 passed
treasury-balance-projection:               4 passed
cash-flow-consistency:                    13 passed
inventory-subledger-reconciliation:       13 passed
```

## Design Decisions

- **Purchasing seeded fixture**: Uses production `PurchaseInvoiceService.postPI()` — zero raw SQL for journal entries
- **Sales seeded fixture**: Lives in `apps/api/src/lib/` (not `modules-sales`) because `modules-sales` can't depend on `modules-accounting` (architectural boundary). Uses `JournalsService.createManualEntry()` with `docType='SALES_INVOICE'`
- **JournalsService extension**: Added optional `opts?` parameter to `createManualEntry()` for custom doc_type — backwards-compatible

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build (all packages) | ✅ Passes |
| Build (API) | ✅ Passes |

---

**Story is COMPLETE.**
