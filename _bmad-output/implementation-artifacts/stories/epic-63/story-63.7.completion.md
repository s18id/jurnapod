# Story 63.7 Completion Report: Create purchasing test fixtures in modules-purchasing

**Story:** Create purchasing test fixtures (createTestPurchaseInvoice, createTestApPayment)  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Created `createTestPurchaseInvoice` and `createTestApPayment` fixtures in `packages/modules/purchasing/src/test-fixtures/`. Both use production service functions (`PurchaseInvoiceService.createDraftPI`, `APPaymentService.createDraftAPPayment`). Also replaced raw `INSERT INTO suppliers` with the existing `createSupplierFixture` in affected test files.

---

## Files

| Action | File | Description |
|--------|------|-------------|
| Created | `packages/modules/purchasing/src/test-fixtures/purchase-invoice-fixtures.ts` | `createTestPurchaseInvoice` via `PurchaseInvoiceService` |
| Created | `packages/modules/purchasing/src/test-fixtures/ap-payment-fixtures.ts` | `createTestApPayment` via `APPaymentService` |
| Modified | `packages/modules/purchasing/src/test-fixtures/types.ts` | Added `PurchaseInvoiceFixture`, `ApPaymentFixture` types |
| Modified | `packages/modules/purchasing/src/test-fixtures/index.ts` | Export new fixtures |
| Modified | `packages/modules/purchasing/src/index.ts` | Re-export fixture types |
| Modified | `ap-aging-projection-reconciliation.test.ts` | Raw SQL → `createSupplierFixture` + `createTestPurchaseInvoice` + `createTestApPayment` |
| Modified | `ap-subledger-reconciliation.test.ts` | Raw SQL → `createSupplierFixture` + `createTestPurchaseInvoice` |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `createTestPurchaseInvoice` fixture exists | ✅ Uses `PurchaseInvoiceService.createDraftPI` |
| AC2 | `createTestApPayment` fixture exists | ✅ Uses `APPaymentService.createDraftAPPayment` |
| AC3 | Exported from package index | ✅ |
| AC4 | Affected files use `createSupplierFixture` + new fixtures | ✅ |
| AC5 | No raw `INSERT INTO suppliers/purchase_invoices/ap_payments` | ✅ |
| AC6 | Purchasing test suites pass | ✅ 27/27 tests (8 ap-aging + 19 ap-subledger) |

## Design Decisions

- Fixtures create DRAFT documents only — posting handled separately by tests via production `postPI`/`postAPPayment`
- Bank account type changed from `ASSET` → `BANK` to satisfy production service validation
- Deterministic defaults using same `makeRunId()` pattern as existing fixtures

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build (modules-purchasing) | ✅ Passes |
| Build (API) | ✅ Passes |

---

**Story is COMPLETE.**
