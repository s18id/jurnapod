# Story 63.3 Completion Report: Replace wrong getInvoiceOpenAmount with production export

**Story:** Replace wrong getInvoiceOpenAmount with production export  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Exported `computePurchaseInvoiceOpenAmount` from `@jurnapod/modules-purchasing` public API and replaced the inline `getInvoiceOpenAmount()` function in `ap-payment-correctness.test.ts`. The inline version had a P0 bug: it computed `grand_total - SUM(payments)` without multiplying by `exchange_rate`, producing wrong open amounts for non-IDR invoices. The production function correctly applies `exchange_rate` and also subtracts applied credits.

---

## Files

| Action | File | Description |
|--------|------|-------------|
| Modified | `packages/modules/purchasing/src/index.ts` | Added export: `computePurchaseInvoiceOpenAmount` |
| Modified | `ap-payment-correctness.test.ts` | Removed 18-line inline function. Replaced 4 call sites with `computePurchaseInvoiceOpenAmount(db, testCompanyId, invoiceId)`. Added import. |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `computePurchaseInvoiceOpenAmount` exported from `modules-purchasing` | ✅ |
| AC2 | Test imports and uses production function | ✅ |
| AC3 | Multi-currency assertions correct (exchange_rate applied) | ✅ |
| AC4 | Build passes for `modules-purchasing` | ✅ |
| AC5 | Full purchasing test suite passes | ✅ 8/8 tests |

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build | ✅ Successful |

## Dev Notes

- Production function signature: `computePurchaseInvoiceOpenAmount(db: KyselySchema, companyId: number, invoiceId: number): Promise<string>` — returns DECIMAL string
- Test wraps with `Number()` at call sites for numeric assertions
- Function also deducts applied credits (`purchase_credit_applications`) which the inline version didn't handle

---

**Story is COMPLETE.**
