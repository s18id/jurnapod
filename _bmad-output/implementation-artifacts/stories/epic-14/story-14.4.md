# Story 14.4: Migrate import/batch-operations.ts - WRITE Operations

**Epic:** Epic 14  
**Story Number:** 14.4  
**Status:** done
**Completed:** 2026-03-28
**Estimated Time:** 3 hours  
**Priority:** P1

---

## Summary

Migrate `apps/api/src/lib/import/batch-operations.ts` INSERT/UPDATE functions from raw SQL to Kysely ORM.

## Functions to Migrate

| Function | SQL Pattern | Lines |
|----------|-------------|-------|
| `batchUpdateItems` | UPDATE loop | 128-146 |
| `batchInsertItems` | INSERT loop | 168-186 |
| `batchUpdatePrices` | UPDATE loop | 248-256 |
| `batchInsertPrices` | INSERT loop | 275-289 |

## Technical Approach

### UPDATE Pattern

```typescript
// BEFORE
for (const item of updates) {
  await connection.execute(
    `UPDATE items SET sku = ?, name = ?, item_type = ?, track_stock = ? WHERE id = ?`,
    [item.sku, item.name, item.itemType, item.trackStock, item.id]
  );
}

// AFTER - Consider Kysely's batch update or loop with prepared statement
// Note: Kysely's batch update is optimized for PostgreSQL; MySQL may benefit from loop
for (const item of updates) {
  await kysely
    .updateTable('items')
    .set({
      sku: item.sku,
      name: item.name,
      item_type: item.itemType,
      track_stock: item.trackStock
    })
    .where('id', '=', item.id)
    .execute();
}
```

### INSERT Pattern

```typescript
// BEFORE
for (const item of inserts) {
  await connection.execute(
    `INSERT INTO items (company_id, sku, name, item_type, track_stock) VALUES (?, ?, ?, ?, ?)`,
    [companyId, item.sku, item.name, item.itemType, item.trackStock]
  );
}

// AFTER
for (const item of inserts) {
  await kysely
    .insertInto('items')
    .values({
      company_id: companyId,
      sku: item.sku,
      name: item.name,
      item_type: item.itemType,
      track_stock: item.trackStock
    })
    .execute();
}
```

## Key Considerations

### Transaction Handling

All WRITE operations receive a `PoolConnection` and must:
- Use `newKyselyConnection(connection)` for Kysely wrapper
- Maintain atomicity across batch operations
- Preserve rollback behavior on error

### Empty Array Handling

```typescript
// Must handle empty arrays gracefully
if (updates.length === 0) return;
if (inserts.length === 0) return;
```

### Batch Performance

Kysely's batch operations are PostgreSQL-optimized. For MySQL:
- Loop with individual statements may be acceptable
- Consider prepared statements for repeated operations

## Dependencies

- `@jurnapod/db` package with Kysely schema
- `PoolConnection` for transaction support

## Acceptance Criteria

- [x] `batchUpdateItems` uses Kysely update builder
- [x] `batchInsertItems` uses Kysely insert builder
- [x] `batchUpdatePrices` uses Kysely update builder
- [x] `batchInsertPrices` uses Kysely insert builder
- [x] Same function signatures (no breaking changes)
- [x] Transaction handling preserved
- [x] Empty array edge cases handled
- [x] All existing tests pass
- [x] TypeScript compilation succeeds

## Dev Notes

- Decimal columns (price) use schema's `Decimal` type (string)
- May need `toNumber()` helper if existing code expects number
- Audit logging integration unchanged (via connection)

## Files Modified

- `apps/api/src/lib/import/batch-operations.ts`
- `apps/api/src/lib/import/batch-operations.test.ts` (existing tests)

---

*Story file created: 2026-03-28*

## Dev Agent Record

### Implementation Notes

**Date Completed:** 2026-03-28

**Changes Made:**
- Migrated `batchUpdateItems` from raw SQL to Kysely update builder
- Migrated `batchInsertItems` from raw SQL to Kysely insert builder
- Migrated `batchUpdatePrices` from raw SQL to Kysely update builder
- Migrated `batchInsertPrices` from raw SQL to Kysely insert builder
- Replaced `connection.execute()` with `newKyselyConnection(connection)`
- Used `executeTakeFirst()` for single-row operations

**Key Implementation Details:**
- Used loop-based approach (as per MySQL Kysely recommendation) for all write operations
- `updateTable().set().where().executeTakeFirst()` pattern for updates
- `insertInto().values().executeTakeFirst()` pattern for inserts
- `numUpdatedRows` property (not `numAffectedRows`) used from Kysely's `UpdateResult`
- `Boolean` to `1/0` conversion preserved for `is_active` field
- `new Date()` used for `updated_at` timestamp

**Bug Fix:**
- Fixed SQL bug in `batchInsertItems` - original had mismatched columns/values (7 columns but 9 values)
- Corrected to include all 9 columns: `company_id, sku, name, item_type, barcode, item_group_id, cogs_account_id, inventory_asset_account_id, is_active`

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
