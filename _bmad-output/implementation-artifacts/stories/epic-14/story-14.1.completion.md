# Story 14.1 Completion: Migrate import/validation.ts to Kysely

## Summary
Migrated `checkSkuExists` and `batchCheckSkusExist` functions from raw SQL to Kysely ORM.

## Files Modified
- `apps/api/src/lib/import/validation.ts`

## Changes
- Replaced `pool.execute()` with Kysely query builder
- Added connection leak fix (try/finally with `db.destroy()`)
- Used `executeTakeFirst()` for single row queries
- Preserved optional `connection` parameter for transaction reuse

## Test Results
```
npm run test:unit:single -w @jurnapod/api src/lib/import/validation.test.ts
# pass 4 (100%)
```

## Acceptance Criteria Evidence
- [x] `checkSkuExists` uses Kysely query builder
- [x] `batchCheckSkusExist` uses Kysely query builder
- [x] Same function signatures (no breaking changes)
- [x] Optional `connection` parameter preserved
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

## Technical Notes
- Connection management: Uses `needsToRelease` flag to track if function acquired connection internally
- Return type preserved: `{ exists: boolean, itemId?: number }`
- Kysely's `.where("sku", "in", skus)` handles empty arrays gracefully

---

_Completion date: 2026-03-28_
