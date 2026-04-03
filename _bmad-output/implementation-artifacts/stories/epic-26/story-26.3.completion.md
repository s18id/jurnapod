# story-26.3 completion notes

## Summary
Implemented `restoreStock` and `adjustStock` in `StockServiceImpl`.

## What was implemented
- `resolveInboundUnitCost` helper: queries `inventory_item_costs.current_avg_cost` → fallback to `item_prices.price`
- `restoreStock`: additive stock update, REFUND transaction, `createCostLayer`
- `adjustStock`: `FOR UPDATE` lock, ADJUSTMENT transaction, positive adjustments create cost layers

## Review result
**APPROVED** — no blockers. All P0/P1 criteria passed.

## Files changed
- `packages/modules/inventory/src/services/stock-service.ts`
