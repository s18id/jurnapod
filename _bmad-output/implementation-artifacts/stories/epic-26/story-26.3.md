# story-26.3: Implement restoreStock and adjustStock in StockServiceImpl

## Description

Implement `restoreStock` and `adjustStock` in `StockServiceImpl`. These are the cost-layer creating operations:

- `restoreStock` — restores stock for voids/refunds, creates inbound cost layers
- `adjustStock` — manual stock adjustment, creates inbound cost layers for positive adjustments

Both call `createCostLayer` from `modules-inventory-costing` for the cost side effect.

## Context

**Source of truth:**
- `restoreStock`: `apps/api/src/lib/stock.ts` lines 514–578
- `adjustStock`: `apps/api/src/lib/stock.ts` lines 584–675

**`restoreStock` current behavior:**
1. For each item: `UPDATE inventory_stock SET quantity += qty, available_quantity += qty`
2. If no row exists: INSERT new `inventory_stock` row
3. `INSERT inventory_transactions` (type = REFUND=2)
4. Resolve unit cost: query `inventory_item_costs` (current_avg_cost), fallback to `item_prices`
5. Call `createCostLayer({ companyId, itemId, transactionId, unitCost, quantity })`

**`adjustStock` current behavior:**
1. Lock `inventory_stock` row with `FOR UPDATE`
2. `UPDATE inventory_stock` with new quantity (current + adjustment_quantity)
3. Update available_quantity (newQty - reserved)
4. Prevent negative stock
5. `INSERT inventory_transactions` (type = ADJUSTMENT=5)
6. If `adjustment_quantity > 0`: resolve unit cost + `createCostLayer`

**Key boundary rule (Option B from design):**
- `restoreStock` and `adjustStock` call `createCostLayer` directly from `modules-inventory-costing`
- They do NOT call `deductWithCost` — that's for consumption, not creation
- `modules-inventory` is the boss of stock rows and transaction logs; `modules-inventory-costing` is hired only for cost math

## Acceptance Criteria

- [ ] `restoreStock` implemented in `StockServiceImpl`
  - Updates `inventory_stock` quantities (additive)
  - Creates `inventory_stock` row if not exists
  - Inserts `inventory_transactions` (type = REFUND=2)
  - Calls `createCostLayer` with resolved unit cost
  - Atomic transaction
  - Company/outlet scoping enforced

- [ ] `adjustStock` implemented in `StockServiceImpl`
  - Locks `inventory_stock` with `FOR UPDATE`
  - Validates resulting quantity >= 0
  - Updates quantity and available_quantity
  - Inserts `inventory_transactions` (type = ADJUSTMENT=5)
  - For positive adjustments: resolves unit cost + calls `createCostLayer`
  - Atomic transaction
  - Company/outlet scoping enforced

- [ ] `resolveInboundUnitCost` — shared helper needed for both
  - Queries `inventory_item_costs.current_avg_cost` first
  - Falls back to `item_prices.price` (most recent)
  - Throws if neither found

- [ ] Existing tests pass
- [ ] `npm run typecheck -w @jurnapod/modules-inventory`
- [ ] `npm run build -w @jurnapod/modules-inventory`

## Files to Modify

```
packages/modules/inventory/src/services/stock-service.ts
```

## Dependency

- `story-26.3` → `story-26.1` (interface must exist)
- `story-26.3` → `story-26.2` (can be implemented in parallel after 26.1)

## Implementation Reference

### createCostLayer signature (from modules-inventory-costing)

```typescript
createCostLayer(params: {
  companyId: number;
  itemId: number;
  transactionId: number;
  unitCost: number;
  quantity: number;
}, db: KyselySchema): Promise<void>
```

### restoreStock skeleton

```typescript
async restoreStock(input: RestoreStockInput, db: KyselySchema): Promise<boolean> {
  return withExecutorTransaction(db, async (executor) => {
    for (const item of input.items) {
      // UPDATE inventory_stock SET quantity += qty, available_quantity += qty
      // If no row: INSERT inventory_stock
      // INSERT inventory_transactions (type: REFUND=2)
      // resolveInboundUnitCost(executor, companyId, item.product_id)
      // createCostLayer({ companyId, itemId, transactionId, unitCost, quantity }, executor)
    }
    return true;
  });
}
```

### adjustStock skeleton

```typescript
async adjustStock(input: StockAdjustmentInput, db: KyselySchema): Promise<boolean> {
  return withExecutorTransaction(db, async (executor) => {
    // SELECT FOR UPDATE inventory_stock
    // Validate newQty >= 0
    // UPDATE inventory_stock SET quantity = newQty, available_quantity = newQty - reserved
    // INSERT inventory_transactions (type: ADJUSTMENT=5)
    // If adjustment_quantity > 0:
    //   resolveInboundUnitCost(executor, companyId, product_id)
    //   createCostLayer({ companyId, itemId, transactionId, unitCost, quantity }, executor)
    return true;
  });
}
```

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory
npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts
```
