# story-24.3: Update `lib/stock.ts` to use costing package

## Description

Refactor cost-aware stock operations in `apps/api/src/lib/stock.ts` to delegate to the `@jurnapod/modules-inventory-costing` package.

## Acceptance Criteria

- [x] `deductStockWithCost` delegates to costing package
- [x] `deductStockForSaleWithCogs` delegates to costing package
- [x] `restoreStock` delegates to costing package
- [x] `adjustStock` delegates to costing package
- [x] Non-cost stock operations still work (no regression)

## Files to Modify

- `apps/api/src/lib/stock.ts` (refactor cost operations)

## Dependencies

- story-24.2 (costing extraction must be complete)

## Implementation

1. Import `deductWithCost` from `@jurnapod/modules-inventory-costing`
2. Refactor `deductStockWithCost` to use `deductWithCost` contract
3. Update `deductStockForSaleWithCogs` to use new contract
4. Update `restoreStock` and `adjustStock` similarly
5. Ensure error handling is preserved

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/lib/stock*.test.ts
```

## Notes

The key is to preserve the existing function signatures while delegating the core logic to the costing package. The API adapter handles any API-specific concerns (error translation, response mapping).

## Dev Agent Record

### Implementation Summary

Refactored `deductStockWithCost` to use the `deductWithCost` contract from `@jurnapod/modules-inventory-costing` package, following the `stockTxId` pattern established in 24-2.

### Changes Made

**File: `apps/api/src/lib/stock.ts`**
- Updated imports: replaced `calculateCost` with `deductWithCost` and `ItemCostResult` type
- Refactored `deductStockWithCost`:
  - Phase 1: Validate stock and create pre-created inventory transactions (stockTxIds)
  - Phase 2: Update stock quantities
  - Phase 3: Delegate cost calculation to `deductWithCost` using the stockTxId pattern
  - Phase 4: Build results matching existing `StockDeductResult` interface
- `restoreStock` and `adjustStock` already correctly delegate to costing package via `createCostLayer` from `@/lib/cost-tracking`
- `deductStockForSaleWithCogs` benefits automatically from the `deductStockWithCost` refactor

### Test Results

- `npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts` - **28 tests passed**
- `npm run test:unit:single -w @jurnapod/api src/lib/cost-auditability.test.ts` - **7 tests passed**

### Status

- Status: **REVIEW**