# Story 15.3: TD-030 Effective Date Filtering - Migration

**Epic:** Epic 15
**Story Number:** 15.3
**Status:** review
**Estimated Time:** 4 hours
**Priority:** P1

---

## Summary

Migrate to effective date filtering by adding `effective_from` and `effective_to` columns to affected tables.

## Context

TD-030 from Epic 8: "Effective date filtering - requires migration to add effective_from/to columns"

This is blocking accurate date-range filtering for variant prices and other time-sensitive data.

## Analysis

Identify affected tables and queries:
1. `item_prices` (NOT `variant_prices` - the resolver uses item_prices table) - needs effective date columns
2. `items` - may need effective dates for future pricing (not implemented in this story)
3. Other time-sensitive tables (not implemented in this story)

## Technical Approach

### Step 1: Schema Analysis

Confirmed that `item_prices` table (used by variant-price-resolver.ts) did NOT have effective date columns.

### Step 2: Migration Created

Created migration `0128_story_15_3_effective_date_columns.sql` that adds:
- `effective_from BIGINT NOT NULL DEFAULT 0` - unix milliseconds, 0 = always effective from beginning
- `effective_to BIGINT NOT NULL DEFAULT 0` - unix milliseconds, 0 = no expiration
- Index `idx_item_prices_effective_dates` for efficient range queries

### Step 3: Query Logic Updated

Updated `variant-price-resolver.ts` to use BIGINT unix ms comparison instead of DATETIME strings:
```typescript
// Changed from DATETIME string comparison:
const dateStr = date.toISOString().slice(0, 19).replace('T', ' ');
sql += ` AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`;

// To BIGINT unix milliseconds:
const now = date.getTime();
sql += ` AND effective_from <= ? AND (effective_to = 0 OR effective_to >= ?)`;
```

### Step 4: Kysely Schema Updated

Updated `ItemPrices` interface in `packages/db/src/kysely/schema.ts` to include:
- `effective_from: number`
- `effective_to: number`
- `variant_id: Generated<number | null>` (was missing from schema)

### Step 5: Batch Operations Updated

Updated `batch-operations.ts` to include new columns in inserts.

### Step 6: Filter Control

The effective date filter is DISABLED by default (`effectiveDateFilterEnabled = false`).
After migration is applied, call `enableEffectiveDateFilter()` to enable filtering.

## Key Considerations

1. **Backward Compatibility**: Existing rows with `effective_from = 0` are treated as "always effective" (filter condition: `effective_from <= now`)
2. **No Expiration**: Rows with `effective_to = 0` never expire (filter condition: `effective_to = 0 OR effective_to >= now`)
3. **Migration Safety**: Uses `information_schema` checks for rerunnable migration
4. **Time Resolution**: BIGINT unix milliseconds per project conventions

## Acceptance Criteria

- [x] Schema analysis completed
- [x] Migration written with `information_schema` checks
- [x] Query logic updated to filter by effective dates (BIGINT unix ms)
- [x] Backward compatibility preserved (filter disabled by default)
- [x] Existing tests pass (8/8 variant-price-resolver tests pass)
- [ ] TD-030 marked as resolved in TECHNICAL-DEBT.md (deferred to Story 15.4)

## Dependencies

- `@jurnapod/db` package with Kysely schema

## Files Modified

- `packages/db/migrations/0128_story_15_3_effective_date_columns.sql` (NEW)
- `packages/db/src/kysely/schema.ts` (added effective_from, effective_to, variant_id to ItemPrices)
- `apps/api/src/lib/pricing/variant-price-resolver.ts` (updated query logic to use BIGINT unix ms)
- `apps/api/src/lib/import/batch-operations.ts` (added new columns to insert)

## Files to Modify

- `packages/db/migrations/` (migration created)
- `apps/api/src/lib/pricing/variant-price-resolver.ts`
- `docs/adr/TECHNICAL-DEBT.md` (mark TD-030 resolved - deferred to Story 15.4)

## Validation

```bash
npm run typecheck -w @jurnapod/api  # PASS
npm run build -w @jurnapod/api      # PASS
npm run test:unit:single -w @jurnapod/api src/lib/pricing/variant-price-resolver.test.ts  # 8/8 PASS
npm run test:unit:sync -w @jurnapod/api  # 82/82 PASS
```

---

*Story file created: 2026-03-28*
*Implementation completed: 2026-03-28*
