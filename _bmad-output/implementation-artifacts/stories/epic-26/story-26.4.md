# story-26.4: Update API stock.ts to delegate, remove cost-tracking adapter

## Description

Flip `apps/api/src/lib/stock.ts` to delegate cost-dependent operations to `getStockService()`. Remove `@/lib/cost-tracking.ts` after confirming it's unused.

## Context

After stories 26.1–26.3, `modules-inventory` is the canonical home for:
- All basic stock operations (already there)
- `deductStockWithCost`, `restoreStock`, `adjustStock` (moved in 26.2–26.3)

This story updates the API `stock.ts` facade:
1. Keep `deductStockForSaleWithCogs` in API (it composes stock + COGS journal posting — crosses accounting boundary)
2. Replace `deductStockWithCost`, `restoreStock`, `adjustStock` implementations with delegation to `getStockService()`
3. Re-export moved types so consumer import paths remain stable
4. Remove `@/lib/cost-tracking.ts` (thin adapter wrapping costing package — unused after this)

## Acceptance Criteria

- [ ] `apps/api/src/lib/stock.ts` updated:
  - `deductStockWithCost` → delegates to `getStockService(db).deductStockWithCost(input, db)`
  - `restoreStock` → delegates to `getStockService(db).restoreStock(input, db)`
  - `adjustStock` → delegates to `getStockService(db).adjustStock(input, db)`
  - `deductStockForSaleWithCogs` stays in API unchanged (it still calls the now-delegated `deductStockWithCost`)
  - All re-exported types still work for existing consumers
- [ ] `@/lib/cost-tracking.ts` removed (no remaining imports)
- [ ] All consumers still work:
  - `apps/api/src/routes/stock.ts`
  - `apps/api/src/lib/sync/push/stock.ts`
  - `apps/api/src/lib/sync/push/transactions.ts`
  - `apps/api/src/middleware/stock.ts`
  - `apps/api/src/lib/sync/push/types.ts`
  - `apps/api/src/lib/stock.test.ts`
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] `npm run build -w @jurnapod/api`
- [ ] `npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts`

## Files to Modify

```
apps/api/src/lib/stock.ts                          (delegate implementations)
apps/api/src/lib/cost-tracking.ts                  (REMOVE)
```

## Dependency

- `story-26.4` → `story-26.2` and `story-26.3` (methods must exist before delegation)

## Implementation Notes

### Delegation pattern in stock.ts

```typescript
// deductStockWithCost — replace implementation with:
export async function deductStockWithCost(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  user_id: number,
  db?: KyselySchema
): Promise<StockDeductResult[]> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.deductStockWithCost(
    { company_id, outlet_id, items, reference_id, user_id },
    database
  );
}

// restoreStock — replace implementation with:
export async function restoreStock(
  company_id: number,
  outlet_id: number,
  items: StockItem[],
  reference_id: string,
  user_id: number,
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.restoreStock(
    { company_id, outlet_id, items, reference_id, user_id },
    database
  );
}

// adjustStock — replace implementation with:
export async function adjustStock(
  input: StockAdjustmentInput,
  db?: KyselySchema
): Promise<boolean> {
  const database = db ?? getDb();
  const service = getStockService(database);
  return service.adjustStock(input, database);
}
```

### Confirm no remaining imports of cost-tracking.ts

Before deleting, run:
```bash
rg "cost-tracking" apps/api/src/ --type ts
```
Must return zero results.

### DeductStockForSaleWithCogs stays

```typescript
// KEEP this in API — it composes stock deduction + cogs-posting
export async function deductStockForSaleWithCogs(
  input: DeductStockForSaleInput,
  db?: KyselySchema
): Promise<DeductStockForSaleResult> {
  // Still calls deductStockWithCost (now delegated) + postCogsForSale
  // Do not move this into modules-inventory
}
```

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts
rg "cost-tracking" apps/api/src/ --type ts  # must be empty
```
