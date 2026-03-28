# Story 15.3: TD-030 Effective Date Filtering - Migration

**Epic:** Epic 15
**Story Number:** 15.3
**Status:** backlog
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
1. `variant_prices` - has effective dates but may not be filtering correctly
2. `items` - may need effective dates for future pricing
3. Other time-sensitive tables

## Technical Approach

### Step 1: Schema Analysis

```sql
-- Check existing effective date columns
DESCRIBE variant_prices;
DESCRIBE items;
```

### Step 2: Migration (if needed)

Add `effective_from` and `effective_to` columns:

```sql
ALTER TABLE variant_prices
ADD COLUMN effective_from BIGINT DEFAULT 0,
ADD COLUMN effective_to BIGINT DEFAULT 0;
```

### Step 3: Update Query Logic

Update `variant-price-resolver.ts` to filter by effective dates:

```typescript
// Current (may not handle effective dates correctly)
const prices = await db
  .selectFrom('variant_prices')
  .where('item_id', '=', itemId)
  .execute();

// Updated with effective date filtering
const now = Temporal.Now.instant().epochMilliseconds;
const prices = await db
  .selectFrom('variant_prices')
  .where('item_id', '=', itemId)
  .where('effective_from', '<=', now)
  .where((eb) => eb.or([
    eb('effective_to', '=', 0),
    eb('effective_to', '>', now)
  ]))
  .execute();
```

## Key Considerations

1. **Backward Compatibility**: Existing rows with `effective_from = 0` should be treated as "always effective"
2. **Time Resolution**: Use unix milliseconds (BIGINT) per project conventions
3. **Migration Safety**: Use `information_schema` checks for rerunnable migration

## Acceptance Criteria

- [ ] Schema analysis completed
- [ ] Migration written (if needed) with `information_schema` checks
- [ ] Query logic updated to filter by effective dates
- [ ] Backward compatibility preserved
- [ ] Existing tests pass
- [ ] TD-030 marked as resolved in TECHNICAL-DEBT.md

## Dependencies

- `@jurnapod/db` package with Kysely schema

## Files to Modify

- `packages/db/migrations/` (if needed)
- `apps/api/src/lib/variant-price-resolver.ts`
- `docs/adr/TECHNICAL-DEBT.md` (mark TD-030 resolved)

---

*Story file created: 2026-03-28*
