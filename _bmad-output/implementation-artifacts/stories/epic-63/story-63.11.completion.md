# Story 63.11 Completion Report: Consolidate duplicate flow helpers

**Story:** Consolidate duplicate flow helpers to package fixtures + update 8+ test files  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Extracted 3 duplicated flow helpers into shared API test helper files and updated 8+ test files to import from canonical locations. Eliminated `createSentPO()` duplication across 3 files, `createPostedPI()` duplication across 2 files, and sales flow helper duplication across 5+ files.

---

## Files

| Action | File | Description |
|--------|------|-------------|
| Created | `apps/api/__test__/helpers/purchasing-flows.ts` | `createSentPurchaseOrder(opts)`, `createPostedPurchaseInvoice(opts)` |
| Created | `apps/api/__test__/helpers/sales-flows.ts` | `createPostedInvoice(opts)`, `createAndPostPayment(opts)` |
| Modified | `goods-receipts.test.ts` | Removed `createSentPO`, 8 call sites → `createSentPurchaseOrder({...})` |
| Modified | `document-chain.test.ts` | Removed `createSentPO`, 10 call sites → `createSentPurchaseOrder({...})` |
| Modified | `ap-state-machine.test.ts` | Removed `createSentPO`, `createPOWithGRN` now uses shared helper |
| Modified | `ap-payment-correctness.test.ts` | `createPostedPi` delegates to `createPostedPurchaseInvoice` |
| Modified | `treasury-reconciliation.test.ts` | Sales flow helpers → shared `sales-flows.ts` |
| Modified | `ar-credit-void-refund.test.ts` | Sales flow helpers → shared `sales-flows.ts` |
| Modified | `ar-invoice-posting.test.ts` | Added import (no duplicates to replace) |
| Modified | `payment-lifecycle.test.ts` | Added import (no duplicates to replace) |
| Modified | `invoice-lifecycle.test.ts` | Added import (no duplicates to replace) |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | `createSentPurchaseOrder` in shared helpers | ✅ |
| AC2 | `createPostedPurchaseInvoice` in shared helpers | ✅ |
| AC3 | `createSalesFixtureFlow` (`createPostedInvoice`/`createAndPostPayment`) in shared helpers | ✅ |
| AC4 | All duplicate inline helpers replaced with imports | ✅ |
| AC5 | Full test suite passes | ✅ (3 pre-existing flaky failures pass in isolation) |

## Design Decisions

- Helpers placed in `apps/api/__test__/helpers/` (not packages) because they use the API layer (`fetch`, baseUrl, auth tokens)
- Each helper takes explicit opts (no closure dependencies on test variables)
- `createSentPurchaseOrder` supports optional `createdPOIds` array for cleanup tracking

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| Build (API) | ✅ Passes |

---

**Story is COMPLETE.**
