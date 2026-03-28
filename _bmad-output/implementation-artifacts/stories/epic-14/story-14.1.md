# Story 14.1: Migrate import/validation.ts to Kysely

**Epic:** Epic 14  
**Story Number:** 14.1  
**Status:** done
**Completed:** 2026-03-28
**Estimated Time:** 1 hour  
**Priority:** P1

---

## Summary

Migrate `apps/api/src/lib/import/validation.ts` functions from raw SQL to Kysely ORM.

## Functions to Migrate

| Function | SQL Pattern | Lines |
|----------|-------------|-------|
| `checkSkuExists` | SELECT with company_id + sku | 54-67 |
| `batchCheckSkusExist` | SELECT with IN clause | 121-130 |

## Technical Approach

### Pattern

```typescript
// BEFORE
const [rows] = await connection.execute<RowDataPacket[]>(
  "SELECT id FROM items WHERE company_id = ? AND sku = ? LIMIT 1",
  [companyId, sku]
);

// AFTER
const row = await db
  .selectFrom("items")
  .select(["id"])
  .where("company_id", "=", companyId)
  .where("sku", "=", sku)
  .executeTakeFirst();
```

## Dependencies

- `@jurnapod/db` package with Kysely schema
- `newKyselyConnection()` helper function

## Acceptance Criteria

- [x] `checkSkuExists` uses Kysely query builder
- [x] `batchCheckSkusExist` uses Kysely query builder
- [x] Same function signatures (no breaking changes)
- [x] Optional `connection` parameter for transaction reuse preserved
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

## Dev Notes

- Uses `newKyselyConnection()` for connection wrapping
- Returns `undefined` instead of empty array for `executeTakeFirst()`
- Consider adding type safety for return values

## Files Modified

- `apps/api/src/lib/import/validation.ts`
- `apps/api/src/lib/import/validation.test.ts` (if exists)

## Dev Agent Record

### Completion Notes

**Implementation:**
- Migrated `checkSkuExists` from raw SQL `execute()` to Kysely query builder with `.selectFrom("items").where(...).executeTakeFirst()`
- Migrated `batchCheckSkusExist` from raw SQL with `IN` clause placeholders to Kysely `.where("sku", "in", skus)`
- Added null check for `row.sku` since Kysely typed it as `string | null`
- Preserved optional `connection` parameter for transaction reuse
- Uses `newKyselyConnection()` helper from `@jurnapod/db`

**Testing:**
- All 4 unit tests pass (validation.test.ts)
- TypeScript compilation succeeds
- Build succeeds

### Files Changed

- `apps/api/src/lib/import/validation.ts` (migrated to Kysely)

---

*Story file created: 2026-03-28*
*Story completed: 2026-03-28*
