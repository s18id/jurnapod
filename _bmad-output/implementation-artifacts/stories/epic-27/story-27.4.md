# story-27.4: Move stock transaction-resolution to modules-inventory

## Description

Move `sync/push/stock.ts` heavy SQL logic into `modules-inventory` as a POS-specific stock resolution service. Delete the API-local copy after migration.

## Context

`apps/api/src/lib/sync/push/stock.ts` (180 LOC) contains:
- Variant stock resolution and deduction path
- Regular item stock deduction path
- Track-stock filtering logic

This is heavy SQL that belongs in `modules-inventory`, not API.

**Source:** `apps/api/src/lib/sync/push/stock.ts` lines 1–180

## Acceptance Criteria

- [x] `StockService` extended with `resolveAndDeductForPosTransaction(tx, posTransactionId, db)` or equivalent
- [x] POS-specific stock resolution handles variant path + regular item path + track-stock filtering
- [x] API `sync/push/stock.ts` updated to delegate to `getStockService(db).resolveAndDeductForPosTransaction(...)`
- [x] `apps/api/src/lib/sync/push/stock.ts` reduced to thin delegation facade (or deleted if empty)
- [x] `npm run typecheck -w @jurnapod/modules-inventory`
- [x] `npm run build -w @jurnapod/modules-inventory`
- [x] `npm run typecheck -w @jurnapod/api`
- [x] `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`

## Files to Modify

```
packages/modules/inventory/src/services/stock-service.ts    (add POS method)
packages/modules/inventory/src/interfaces/stock-service.ts  (add interface)
apps/api/src/lib/sync/push/stock.ts                        (delegate or delete)
apps/api/src/lib/sync/push/transactions.ts                 (update import)
```

## File List (Changed)

- `packages/modules/inventory/src/interfaces/stock-service.ts` — Added `PosStockDeductResult`, `ResolveAndDeductInput` interfaces, and `resolveAndDeductForPosTransaction` method signature
- `packages/modules/inventory/src/services/stock-service.ts` — Added `resolveAndDeductForPosTransaction` implementation with variant path + regular item path + track-stock filtering
- `apps/api/src/lib/sync/push/stock.ts` — Updated `resolveAndDeductStockForTransaction` to delegate to `getStockService(db).resolveAndDeductForPosTransaction(...)`, kept `deductVariantStock` locally for compatibility

## Dependency

- `story-27.4` → `story-27.1` (uses type contracts from 27.1)

## Implementation Notes

### Interface addition (modules-inventory)

```typescript
// In interfaces/stock-service.ts
export interface PosStockDeductResult {
  variantId: number;
  itemId: number;
  quantity: number;
  stockTxId: number;
  unitCost: number;
  totalCost: number;
}

export interface ResolveAndDeductInput {
  companyId: number;
  outletId: number;
  posTransactionId: string;
  items: Array<{
    variantId?: number;
    itemId: number;
    quantity: number;
    trackStock: boolean;
  }>;
  referenceId: string;
  userId: number;
}

// Extend StockService interface
resolveAndDeductForPosTransaction(input: ResolveAndDeductInput, db: KyselySchema): Promise<PosStockDeductResult[]>;
```

### Key behavior to preserve
- Variant path: if `variantId` present, resolve `item_id` from variant first, then deduct
- Regular path: deduct by `itemId` directly
- Track-stock filter: if `trackStock = false`, skip stock deduction for that item
- Must work within existing `withExecutorTransaction` pattern

### API delegation (after package has implementation)
```typescript
// In apps/api/src/lib/sync/push/stock.ts
export async function resolveAndDeductForPosTransaction(input, db) {
  return getStockService(db).resolveAndDeductForPosTransaction(input, db);
}
```

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
```

## Status

`review`

## Dev Agent Record

### Implementation Summary

Moved stock transaction resolution logic from `apps/api/src/lib/sync/push/stock.ts` into `modules-inventory` as `StockService.resolveAndDeductForPosTransaction()`.

### Key Changes

1. **Added interfaces** (`packages/modules/inventory/src/interfaces/stock-service.ts`):
   - `PosStockDeductResult` — variantId, itemId, quantity, stockTxId, unitCost, totalCost
   - `ResolveAndDeductInput` — companyId, outletId, posTransactionId, items[], referenceId, userId
   - Extended `StockService` interface with `resolveAndDeductForPosTransaction` method

2. **Implemented method** (`packages/modules/inventory/src/services/stock-service.ts`):
   - Variant path: resolves item_id from variant, uses inventory_stock if available, falls back to item_variants.stock_quantity
   - Regular item path: filters by track_stock, locks inventory_stock rows FOR UPDATE, validates quantity, creates inventory_transactions, delegates cost calculation to modules-inventory-costing via deductWithCost
   - Wrapped in `withExecutorTransaction` for atomicity

3. **Thinned API adapter** (`apps/api/src/lib/sync/push/stock.ts`):
   - `resolveAndDeductStockForTransaction` now delegates to `getStockService(db).resolveAndDeductForPosTransaction(...)`
   - Transforms `PosStockDeductResult[]` back to `StockDeductResult[]` to preserve API contract with transactions.ts
   - Kept `deductVariantStock` standalone since it's used in test fixtures
