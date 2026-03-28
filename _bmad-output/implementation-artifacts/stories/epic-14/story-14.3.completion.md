# Story 14.3 Completion: Migrate import/batch-operations.ts - SELECT Operations

## Summary
Migrated `batchFindItemsBySkus` and `batchFindPricesByItemIds` from raw SQL to Kysely ORM.

## Files Modified
- `apps/api/src/lib/import/batch-operations.ts`

## Changes
- Replaced `pool.execute()` with Kysely query builder
- `batchFindItemsBySkus`: SELECT with IN clause → Kysely `.where("sku", "in", skus)`
- `batchFindPricesByItemIds`: SELECT with IN clause → Kysely `.where(...)`
- Preserved `Map<string, number>` return types

## Test Results
```
npm run test:unit:single -w @jurnapod/api src/lib/import/batch-operations.test.ts
# pass 3 (100%)
```

## Acceptance Criteria Evidence
- [x] `batchFindItemsBySkus` uses Kysely query builder
- [x] `batchFindPricesByItemIds` uses Kysely query builder
- [x] `Map<string, number>` return type preserved
- [x] Same function signatures (no breaking changes)
- [x] Empty array edge case handled
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

## Technical Notes
- Kysely's `.where("sku", "in", skus)` handles empty arrays gracefully (no query executed)
- Schema types provide proper typing for `row.id`

---

_Completion date: 2026-03-28_
