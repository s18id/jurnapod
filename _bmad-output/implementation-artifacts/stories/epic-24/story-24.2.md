# story-24.2: Extract `cost-tracking.ts` to costing package

## Description

Extract cost-tracking logic from `apps/api/src/lib/cost-tracking.ts` to `@jurnapod/modules-inventory-costing`. Create clean `deductWithCost()` contract.

## Acceptance Criteria

- [ ] `calculateCost()` logic moved to costing package
- [ ] `createCostLayer()` logic moved to costing package
- [ ] Average costing and sum costing methods implemented
- [ ] `deductWithCost(companyId, items[]) => { stockTxIds, itemCosts }` contract defined
- [ ] Existing COGS tests pass
- [ ] No `apps/**` imports in costing package

## Files to Modify

- `apps/api/src/lib/cost-tracking.ts` (replace with thin adapter)
- `packages/modules/inventory-costing/src/*` (create)

## Dependencies

- story-24.1 (package scaffold must be complete)

## Implementation

1. Read `apps/api/src/lib/cost-tracking.ts` to understand current logic
2. Move the following to `packages/modules/inventory-costing/src/`:
   - `calculateCost()` function
   - `createCostLayer()` function
   - Average costing calculation
   - Sum costing calculation
3. Create `deductWithCost()` function with contract:
   ```typescript
   interface DeductionInput {
     itemId: number;
     qty: number;
     outletId: number;
   }
   
   interface DeductionResult {
     stockTxIds: number[];
     itemCosts: Array<{ itemId: number; qty: number; unitCost: number; totalCost: number }>;
   }
   
   function deductWithCost(db: CostingDb, input: DeductionInput[]): Promise<DeductionResult>;
   ```
4. Replace API `cost-tracking.ts` with thin adapter

## Validation

```bash
npm run typecheck -w @jurnapod/modules-inventory-costing
npm run test:unit:critical -w @jurnapod/api
```

## Notes

The costing package should be database-agnostic in its interface, accepting a DB executor injected from the caller. This allows the API adapter to provide Kysely while keeping the core logic testable.