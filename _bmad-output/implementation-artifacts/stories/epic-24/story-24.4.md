# story-24.4: Update COGS posting to use costing contract

## Description

Refactor `apps/api/src/lib/cogs-posting.ts` to use the `deductWithCost` contract from the costing package instead of direct stock operations.

## Acceptance Criteria

- [ ] `postCogsForSale` uses costing package for cost calculation
- [ ] Journal posting behavior unchanged
- [ ] COGS tests pass
- [ ] No regression in posting idempotency

## Files to Modify

- `apps/api/src/lib/cogs-posting.ts` (refactor to use costing contract)

## Dependencies

- story-24.3 (stock update must be complete)

## Implementation

1. Import `deductWithCost` from `@jurnapod/modules-inventory-costing`
2. Refactor `postCogsForSale` to:
   - Call `deductWithCost` for cost calculation
   - Use returned `itemCosts` for COGS journal entries
3. Ensure transaction boundaries are preserved
4. Verify journal posting still works correctly

## Validation

```bash
npm run test:unit:critical -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/lib/cogs-posting.test.ts
```

## Notes

COGS posting is a P0 financial operation. Ensure:
- Journal entries remain balanced
- Posting is idempotent
- No duplicate journal entries