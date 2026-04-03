# Epic 26 Sprint Plan

## Overview
**Epic:** Extend modules-inventory with Cost-Dependent Stock Operations  
**Duration:** 1 sprint  
**Goal:** Move `deductStockWithCost`, `restoreStock`, and `adjustStock` from `apps/api/src/lib/stock.ts` into `@jurnapod/modules-inventory`, making `modules-inventory` the canonical home for stock orchestration.

## Dependency Direction

```
modules-inventory → modules-inventory-costing (cost math only)
apps/api → modules-inventory (all stock operations)
apps/api → modules-accounting (cogs-posting only — deductStockForSaleWithCogs stays in API)
```

## Epic Goals

1. Extend `StockService` interface with cost-dependent method signatures and types
2. Implement `deductStockWithCost` in `StockServiceImpl` (calls `deductWithCost`)
3. Implement `restoreStock` and `adjustStock` in `StockServiceImpl` (call `createCostLayer`)
4. Update API `stock.ts` to delegate to `getStockService()`, remove dead `cost-tracking.ts` adapter
5. Full validation gate

## Non-Goals

- Moving `deductStockForSaleWithCogs` (stays in API — crosses accounting boundary)
- Changing `modules-inventory-costing` public API
- Changing database schema
- Moving POS offline stock service

## Boundary Rules

- `modules-inventory` may import from `modules-inventory-costing` for cost math
- `modules-inventory` must NOT import from `modules-accounting`
- `modules-inventory` owns all `inventory_stock` row and `inventory_transactions` mutations
- `deductStockForSaleWithCogs` stays in API because it composes stock + COGS journal posting

## Sprint Breakdown

### Sprint 1: Interface + Implementation + Integration

#### Story 26.1: Extend StockService interface with cost-dependent types and signatures
- **Estimate:** 1.5h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Add method signatures, types, update `package.json` dependency, stub implementations

#### Story 26.2: Implement deductStockWithCost in StockServiceImpl
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 26.1
- **Focus:** Move stock lock → inventory_transactions → stock update → deductWithCost call

#### Story 26.3: Implement restoreStock and adjustStock in StockServiceImpl
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 26.1 (parallel with 26.2)
- **Focus:** restoreStock (createCostLayer for refunds), adjustStock (createCostLayer for inbound adjustments)

#### Story 26.4: Update API stock.ts to delegate, remove cost-tracking adapter
- **Estimate:** 1.5h
- **Priority:** P1
- **Dependencies:** 26.2, 26.3
- **Focus:** Flip implementations to delegation, remove `@/lib/cost-tracking.ts`, verify all consumers

#### Story 26.5: Full validation gate
- **Estimate:** 1h
- **Priority:** P1
- **Dependencies:** 26.4
- **Focus:** Run full typecheck/build/test gate, confirm no regressions

## Story Dependencies

```
26.1 (interface)
  └── 26.2 (deductStockWithCost)
  └── 26.3 (restoreStock + adjustStock) [parallel after 26.1]
        └── 26.4 (API delegation) [sequential after 26.2+26.3]
              └── 26.5 (validation gate)
```

## Files Changed Summary

| Story | File | Change |
|-------|------|--------|
| 26.1 | `packages/modules/inventory/package.json` | +modules-inventory-costing dep |
| 26.1 | `packages/modules/inventory/src/interfaces/stock-service.ts` | +types + signatures |
| 26.1 | `packages/modules/inventory/src/services/stock-service.ts` | +stub methods |
| 26.2 | `packages/modules/inventory/src/services/stock-service.ts` | +deductStockWithCost impl |
| 26.3 | `packages/modules/inventory/src/services/stock-service.ts` | +restoreStock + adjustStock impl |
| 26.4 | `apps/api/src/lib/stock.ts` | delegation facade |
| 26.4 | `apps/api/src/lib/cost-tracking.ts` | REMOVE |

## Key Interfaces

```typescript
// StockService interface additions (story 26.1)
interface StockService {
  // ...existing methods...
  deductStockWithCost(input: DeductStockInput, db: KyselySchema): Promise<StockDeductResult[]>;
  restoreStock(input: RestoreStockInput, db: KyselySchema): Promise<boolean>;
  adjustStock(input: StockAdjustmentInput, db: KyselySchema): Promise<boolean>;
}

// Types (story 26.1)
interface StockDeductResult {
  itemId: number;
  quantity: number;
  transactionId: number;
  unitCost: number;
  totalCost: number;
  costResult: ItemCostResult;
}

interface StockAdjustmentInput {
  company_id: number;
  outlet_id: number | null;
  product_id: number;
  adjustment_quantity: number;
  reason: string;
  reference_id?: string;
  user_id: number;
}
```

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Transaction atomicity regression in sync push | Low | Story 26.2 uses same `withExecutorTransaction` pattern as original |
| Breaking import paths for sync consumers | Low | Story 26.4 re-exports types; validates all consumers compile |
| Cost calculation side effects differ | Low | Direct call to same `deductWithCost` + `createCostLayer` functions |
| `cost-tracking.ts` has hidden consumers | Low | Pre-check with `rg` before deletion |

## Completion Criteria

All stories done + all gates pass:
- `npm run typecheck -w @jurnapod/modules-inventory`
- `npm run build -w @jurnapod/modules-inventory`
- `npm run typecheck -w @jurnapod/api`
- `npm run build -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts`
- `npm run test:unit:critical -w @jurnapod/api`
- `rg "cost-tracking" apps/api/src/` → zero results
