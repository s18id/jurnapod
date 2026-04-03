# story-26.2 completion notes

## Summary
Implemented `deductStockWithCost` in `StockServiceImpl`.

## What was implemented
- 4-phase operation: stock lock → inventory_transactions insert → stock update → deductWithCost call
- `SELECT FOR UPDATE` with company/outlet/product scoping
- Quantity validation before deduction
- Atomic transaction via `withExecutorTransaction`
- Result mapping by `stockTxId` → `StockDeductResult[]`

## Review result
**APPROVED** — no blockers. All P0/P1 criteria passed.

## Files changed
- `packages/modules/inventory/src/services/stock-service.ts`

## Review notes
- P3: `user_id` in input unused (may be for future audit trail)
- P3: Generic `Error` instead of domain errors (`InventoryReferenceError`, `InventoryConflictError`) — works but inconsistent with codebase patterns
