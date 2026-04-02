# story-24.3: Update `lib/stock.ts` to use costing package

## Description

Refactor cost-aware stock operations in `apps/api/src/lib/stock.ts` to delegate to the `@jurnapod/modules-inventory-costing` package.

## Acceptance Criteria

- [ ] `deductStockWithCost` delegates to costing package
- [ ] `deductStockForSaleWithCogs` delegates to costing package
- [ ] `restoreStock` delegates to costing package
- [ ] `adjustStock` delegates to costing package
- [ ] Non-cost stock operations still work (no regression)

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