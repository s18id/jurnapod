# Story 14.3: Migrate import/batch-operations.ts - SELECT Operations

**Epic:** Epic 14  
**Story Number:** 14.3  
**Status:** done  
**Estimated Time:** 2 hours  
**Priority:** P1

---

## Summary

Migrate `apps/api/src/lib/import/batch-operations.ts` SELECT functions from raw SQL to Kysely ORM.

## Functions to Migrate

| Function | SQL Pattern | Lines |
|----------|-------------|-------|
| `batchFindItemsBySkus` | SELECT with IN clause | 97-107 |
| `batchFindPricesByItemIds` | SELECT with IN clause | 216-227 |

## Technical Approach

### Pattern for batchFindItemsBySkus

```typescript
// BEFORE
const placeholders = skus.map(() => "?").join(",");
const [rows] = await connection.execute<RowDataPacket[]>(
  `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
  [companyId, ...skus]
);
for (const row of rows) {
  result.set(String(row.sku), Number(row.id));
}

// AFTER
const rows = await kysely
  .selectFrom("items")
  .select(["sku", "id"])
  .where("company_id", "=", companyId)
  .where("sku", "in", skus)
  .execute();
for (const row of rows) {
  result.set(String(row.sku), row.id);
}
```

### Pattern for batchFindPricesByItemIds

```typescript
// Similar pattern - SELECT with IN clause
// Uses item_id and outlet_id for filtering
```

## Return Type

Both functions return `Map<string, number>` - this must be preserved:

```typescript
export async function batchFindItemsBySkus(
  companyId: number,
  skus: string[],
  connection: PoolConnection
): Promise<Map<string, number>> { ... }
```

## Dependencies

- `@jurnapod/db` package with Kysely schema
- `PoolConnection` for transaction support

## Acceptance Criteria

- [x] `batchFindItemsBySkus` uses Kysely query builder
- [x] `batchFindPricesByItemIds` uses Kysely query builder
- [x] `Map<string, number>` return type preserved
- [x] Same function signatures (no breaking changes)
- [x] Empty array edge case handled (return empty Map)
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

## Dev Notes

- Kysely's `where('sku', 'in', skus)` handles empty array gracefully
- No need for manual placeholder generation
- Schema types provide proper typing for `row.id`

## Files Modified

- `apps/api/src/lib/import/batch-operations.ts`
- `apps/api/src/lib/import/batch-operations.test.ts` (existing tests)

---

*Story file created: 2026-03-28*

## Dev Agent Record

### Implementation Notes

**Date Completed:** 2026-03-28

**Changes Made:**
- Migrated `batchFindItemsBySkus` from raw SQL to Kysely query builder
- Migrated `batchFindPricesByItemIds` from raw SQL to Kysely query builder
- Replaced `connection.execute()` with `newKyselyConnection(connection)`
- Used `where('sku', 'in', skus)` and `where('item_id', 'in', itemIds)` for batch filtering
- Preserved `Map<string, number>` return type

**Key Implementation Details:**
- Empty array early return preserved for both functions
- Used `kysely.selectFrom().select().where().execute()` pattern
- `row.id` is typed correctly via Kysely schema (no need for `Number()` conversion but kept for consistency)

**Test Results:**
```
npm run test:unit:single -w @jurnapod/api src/lib/import/batch-operations.test.ts
# tests 3
# pass 3
# fail 0
```

**Validation:**
- TypeScript compilation: ✅ passed
- Build: ✅ passed
- Unit tests: ✅ passed (3 tests)
