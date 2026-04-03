# story-26.1 completion notes

## Summary
Extended `StockService` interface with cost-dependent types and method signatures. No implementation — stubs only.

## What was done
- Added `package.json` dependency on `@jurnapod/modules-inventory-costing`
- Added `tsconfig.json` project reference to `modules-inventory-costing`
- Added types: `StockDeductResult`, `DeductStockInput`, `RestoreStockInput`, `StockAdjustmentInput`
- Added method signatures to `StockService` interface
- Added stub implementations in `StockServiceImpl` (throw TODO errors)

## Review result
**APPROVED** — no blockers. All acceptance criteria met. Typecheck and build pass.

## Files changed
- `packages/modules/inventory/package.json`
- `packages/modules/inventory/tsconfig.json`
- `packages/modules/inventory/src/interfaces/stock-service.ts`
- `packages/modules/inventory/src/services/stock-service.ts`
