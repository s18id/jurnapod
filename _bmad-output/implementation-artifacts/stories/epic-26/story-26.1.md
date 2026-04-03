# story-26.1: Extend StockService interface with cost-dependent types and signatures

## Description

Add the cost-dependent method signatures and types to `StockService` interface in `modules-inventory`. No implementation yet — this story sets up the contract.

## Context

`apps/api/src/lib/stock.ts` currently implements three cost-dependent operations that need to move into `modules-inventory`:
- `deductStockWithCost` — deducts stock + consumes cost layers via `deductWithCost`
- `restoreStock` — restores stock + creates inbound cost layers via `createCostLayer`
- `adjustStock` — adjusts stock quantity + optionally creates cost layers for inbound adjustments

`modules-inventory/src/interfaces/stock-service.ts` already has `StockService` interface with basic stock ops. This story extends it.

`modules-inventory/src/services/stock-service.ts` has `TRANSACTION_TYPE` constants already defined (SALE=1, REFUND=2, RESERVATION=3, RELEASE=4, ADJUSTMENT=5, RECEIPT=6, TRANSFER=7).

## Acceptance Criteria

- [x] `package.json` updated with dependency on `@jurnapod/modules-inventory-costing`
- [x] `StockService` interface extended with:
  - `deductStockWithCost(input, db): Promise<StockDeductResult[]>`
  - `restoreStock(input, db): Promise<boolean>`
  - `adjustStock(input, db): Promise<boolean>`
- [x] Types added to `src/interfaces/stock-service.ts` (or exported from a shared types file):
  - `StockDeductResult` — `{ itemId, quantity, transactionId, unitCost, totalCost, costResult }`
  - `StockAdjustmentInput` — `{ company_id, outlet_id, product_id, adjustment_quantity, reason, reference_id?, user_id }`
  - `DeductStockInput` — `{ company_id, outlet_id, items, reference_id, user_id }`
- [x] `StockDeductResult.itemCostResult` typed as `ItemCostResult` from `@jurnapod/modules-inventory-costing`
- [x] `StockServiceImpl` class signature updated to match interface
- [x] `npm run typecheck -w @jurnapod/modules-inventory` passes
- [x] `npm run build -w @jurnapod/modules-inventory` passes

## Status

Status: **review**

## Files to Modify

```
packages/modules/inventory/
├── package.json                          (+ dependency)
└── src/
    ├── interfaces/
    │   └── stock-service.ts              (extend interface + add types)
    └── services/
        └── stock-service.ts              (stub implementations with TODO)

```

## Dependency

- `story-26.1` → `story-26.2`, `story-26.3` (interface must exist before implementation)

## Implementation Notes

### Types to add

```typescript
// src/interfaces/stock-service.ts

import type { ItemCostResult } from "@jurnapod/modules-inventory-costing";

export interface StockDeductResult {
  itemId: number;
  quantity: number;
  transactionId: number;
  unitCost: number;
  totalCost: number;
  costResult: ItemCostResult;
}

export interface StockAdjustmentInput {
  company_id: number;
  outlet_id: number | null;
  product_id: number;
  adjustment_quantity: number;
  reason: string;
  reference_id?: string;
  user_id: number;
}

export interface DeductStockInput {
  company_id: number;
  outlet_id: number;
  items: StockItem[];
  reference_id: string;
  user_id: number;
}
```

### StockService interface extension

```typescript
// In StockService interface
async deductStockWithCost(input: DeductStockInput, db: KyselySchema): Promise<StockDeductResult[]>;
async restoreStock(input: RestoreStockInput, db: KyselySchema): Promise<boolean>;
async adjustStock(input: StockAdjustmentInput, db: KyselySchema): Promise<boolean>;
```

### Dependency addition to package.json

```json
"dependencies": {
  "@jurnapod/modules-inventory-costing": "0.1.0"
}
```

### Stub implementations in StockServiceImpl

Add stub methods that throw `new Error("TODO: implement in story 26.2")` / `new Error("TODO: implement in story 26.3")` so typecheck passes but implementation is deferred.

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory
```
