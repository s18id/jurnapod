# BIGINT Migration Cutover Pattern

**Based on Epic 7 and Epic 12 Experience**
**Status:** Proven Pattern Reference
**Last Updated:** Sprint 21

---

## Overview

This document captures the team's proven pattern for migrating existing `DATETIME` columns to `BIGINT` Unix timestamp columns. The pattern ensures zero-downtime migration with data integrity, compatible with MySQL 8.0+ and MariaDB.

## Why BIGINT Unix Timestamps?

- **Timezone safety**: Unix timestamps are inherently UTC, eliminating ambiguity
- **Performance**: Numeric comparisons are faster than datetime arithmetic
- **Consistency**: Aligns with industry standard for event/booking systems
- **Reservation time schema**: Canonical `reservation_start_ts` / `reservation_end_ts` in milliseconds

---

## The Six-Phase Pattern

### Phase 1: Schema Migration (Additive)

**Objective:** Add new columns and indexes without modifying existing data

```sql
-- Add new BIGINT columns as NULL initially
ALTER TABLE reservations
  ADD COLUMN reservation_start_ts BIGINT NULL AFTER reservation_time,
  ADD COLUMN reservation_end_ts BIGINT NULL AFTER reservation_start_ts;

-- Add composite indexes including new columns BEFORE backfill
-- Index order: equality columns first, then range column
ALTER TABLE reservations
  ADD INDEX idx_company_outlet_start_ts (company_id, outlet_id, reservation_start_ts, id),
  ADD INDEX idx_company_outlet_table_start_end_status
    (company_id, outlet_id, table_id, reservation_start_ts, reservation_end_ts, status);
```

**Rules:**
- Always use `information_schema` checks for rerunnable migrations
- Add indexes BEFORE backfill to avoid index rebuild on large table
- New columns are `NULL` until backfill completes

### Phase 2: Dual Write

**Objective:** Update all write paths to populate both old and new columns

```typescript
// Write path update pattern
async function createReservation(data: CreateReservationInput) {
  const reservationTime = parseDateTime(data.reservation_time);
  
  const [reservation] = await db.insert(reservations)
    .values({
      ...data,
      // Dual write: populate both
      reservation_time: data.reservation_time,           // Legacy
      reservation_start_ts: unixMs(reservationTime),     // NEW
      reservation_end_ts: unixMs(reservationTime) + (data.duration_minutes * 60000), // NEW
    })
    .returning();
  
  return reservation;
}

// Derive new from old when needed (migration compatibility)
function computeStartTs(legacyDatetime: string | Date): number {
  if (typeof legacyDatetime === 'string') {
    return unixMs(new Date(legacyDatetime));
  }
  return unixMs(legacyDatetime);
}
```

**Rules:**
- Ensure new column is derived from old column when backfilling
- For reservations: `reservation_start_ts = UNIX_TIMESTAMP(reservation_time) * 1000`
- Keep legacy columns for API compatibility during transition

### Phase 3: Read Cutover

**Objective:** Switch read queries to use new BIGINT columns

```typescript
// Date range filter pattern
async function findReservations(
  companyId: string,
  outletId: string,
  dateLocal: string  // YYYY-MM-DD in outlet timezone
) {
  // Step 1: Resolve timezone per-row
  const outlet = await getOutlet(outletId);
  const timezone = outlet.timezone ?? getCompany(companyId).timezone;
  
  // Step 2: Convert local date → UTC timestamp boundaries
  const dayStart = startOfDayInTimezone(dateLocal, timezone);  // 00:00:00 local
  const dayEnd = endOfDayInTimezone(dateLocal, timezone);      // 23:59:59.999 local
  
  // Step 3: Numeric range query (no function on indexed column!)
  return db.query.reservations.findMany({
    where: and(
      eq(reservations.companyId, companyId),
      eq(reservations.outletId, outletId),
      // CORRECT: Function on constant, not on column
      gte(reservations.reservationStartTs, unixMs(dayStart)),
      lt(reservations.reservationStartTs, unixMs(dayEnd)),
    ),
  });
}
```

**⚠️ Critical Rule: Never wrap indexed columns in SQL functions**

```sql
-- BAD: Function on indexed column prevents index usage
WHERE UNIX_TIMESTAMP(reservation_start_ts) >= ?

-- GOOD: Function on constant only
WHERE reservation_start_ts >= FROM_UNIXTIME(? / 1000)
```

### Phase 4: Backfill

**Objective:** Populate new columns from old for existing rows

```typescript
async function backfillReservationTimestamps(batchSize = 1000) {
  let cursor: string | undefined;
  let processed = 0;
  let skipped = 0;
  let parseFailures = 0;
  let missingTimezone = 0;

  while (true) {
    const rows = await db.query.reservations.findMany({
      where: cursor ? gt(reservations.id, cursor) : undefined,
      limit: batchSize,
      columns: {
        id: true,
        companyId: true,
        outletId: true,
        reservationTime: true,
        durationMinutes: true,
        reservationStartTs: true,
      },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      // Skip already backfilled
      if (row.reservationStartTs !== null) {
        skipped++;
        continue;
      }

      try {
        // Resolve timezone per-row: outlet → company
        const outlet = await getOutlet(row.outletId);
        const company = await getCompany(row.companyId);
        const timezone = outlet?.timezone ?? company?.timezone;

        if (!timezone) {
          missingTimezone++;
          continue;
        }

        // Parse legacy datetime
        const reservationMs = unixMs(parseDateTime(row.reservationTime));
        
        // Compute end_ts: handle NULL duration
        let endMs: number;
        if (row.durationMinutes !== null) {
          endMs = reservationMs + (row.durationMinutes * 60000);
        } else {
          // Freeze historical value using company default AT BACKFILL TIME
          const effectiveDuration = company.defaultDurationMinutes ?? 60;
          endMs = reservationMs + (effectiveDuration * 60000);
        }

        await db.update(reservations)
          .set({
            reservationStartTs: reservationMs,
            reservationEndTs: endMs,
          })
          .where(eq(reservations.id, row.id));

        processed++;
      } catch (e) {
        parseFailures++;
        console.error(`Failed to backfill reservation ${row.id}:`, e);
      }
    }

    cursor = rows[rows.length - 1].id;
  }

  return {
    processed,
    skipped,
    parseFailures,
    missingTimezone,
    total: processed + skipped + parseFailures + missingTimezone,
  };
}
```

**Verification Summary Output:**
```
Backfill Complete:
  Processed:         12,450
  Skipped (done):     31,200
  Parse Failures:        23
  Missing Timezone:       5
  Total:             43,678
```

### Phase 5: Validation

**Objective:** Verify correctness of migration

```typescript
// Day boundary classification test
test('reservations on day boundary use outlet timezone', async () => {
  const outlet = await createOutlet({ timezone: 'Asia/Tokyo' });
  
  // 2024-06-15 00:00:00 Tokyo = 2024-06-14 15:00:00 UTC
  await createReservation({
    companyId: company.id,
    outletId: outlet.id,
    reservationTime: '2024-06-15 00:00:00',
    // ...
  });

  const results = await findReservations(company.id, outlet.id, '2024-06-15');
  
  // Must be found in June 15, not June 14
  expect(results).toHaveLength(1);
});

// Overlap semantics test
test('end == next start is non-overlap', async () => {
  await createReservation({
    reservationStart: '2024-06-15 10:00:00',
    durationMinutes: 60,  // ends at 11:00
  });
  
  await createReservation({
    reservationStart: '2024-06-15 11:00:00',  // starts exactly when previous ends
    durationMinutes: 60,
  });

  // Must NOT be flagged as overlap
  const overlaps = await findOverlappingReservations();
  expect(overlaps).toHaveLength(0);
});
```

**Validation Checklist:**
- [ ] Day boundary classification matches outlet timezone
- [ ] Overlap semantics: `a_start < b_end && b_start < a_end` (end == next start = OK)
- [ ] Sync reservation write path: new columns populated on sync
- [ ] Full test suite passes
- [ ] No NULL values in new columns (except legitimately not-yet-backfilled)

### Phase 6: Cleanup (Deferred)

**Objective:** Remove legacy support after stabilization period

```sql
-- Phase 6a: Add NOT NULL constraint after validation window
ALTER TABLE reservations
  MODIFY COLUMN reservation_start_ts BIGINT NOT NULL,
  MODIFY COLUMN reservation_end_ts BIGINT NOT NULL;

-- Phase 6b: Remove legacy column (after API contract update)
ALTER TABLE reservations
  DROP COLUMN reservation_time;
```

**Rules:**
- Defer cleanup until after stabilization period (typically 1 sprint)
- Update API contracts to remove old field derivation first
- Ensure no more references to legacy columns in codebase

---

## Timezone Resolution Rules

**⚠️ Critical: Always resolve in this order**

```
outlet.timezone → company.timezone → ERROR (no UTC fallback)
```

```typescript
function resolveTimezone(outletId: string, companyId: string): string {
  const outlet = getOutlet(outletId);
  if (outlet?.timezone) return outlet.timezone;
  
  const company = getCompany(companyId);
  if (company?.timezone) return company.timezone;
  
  throw new Error(`Missing timezone for outlet ${outletId} or company ${companyId}`);
}
```

**Why no UTC fallback?**
A missing timezone indicates a data quality problem. Falling back to UTC would silently hide the issue and could cause incorrect day boundary classification.

---

## Rollback Considerations

| Phase | Failure Scenario | Rollback Action |
|-------|------------------|-----------------|
| Phase 1 | Migration script fails | No impact; only additive changes |
| Phase 2 | Dual write has bugs | Revert to old column writes; new columns remain NULL |
| Phase 3 | Read cutover causes issues | Revert reads to old columns |
| Phase 4 | Partial backfill | Rerunnable script handles remaining rows |
| Phase 5 | Validation failures | Fix and re-validate; new columns still NULL-safe |

---

## Example: Epic 12 Reservations Migration

### Schema Changes

```sql
-- Columns added
ALTER TABLE reservations
  ADD COLUMN reservation_start_ts BIGINT NULL AFTER reservation_time,
  ADD COLUMN reservation_end_ts BIGINT NULL AFTER reservation_start_ts;

-- Indexes for query performance
ALTER TABLE reservations
  ADD INDEX idx_res_company_outlet_start_ts (company_id, outlet_id, reservation_start_ts, id),
  ADD INDEX idx_res_company_outlet_table_start_end_status
    (company_id, outlet_id, table_id, reservation_start_ts, reservation_end_ts, status);
```

### Write Path

```typescript
// Dual write ensures both columns populated
const startTs = unixMs(reservationTime);
const endTs = startTs + (effectiveDurationMinutes * 60000);

// API compatibility field derived from new canonical column
const reservationAt = formatTimestamp(startTs);  // Kept for API response
```

### Backfill Formula

```typescript
reservation_end_ts = reservation_start_ts + (effective_duration_minutes * 60000)
```

Where `effective_duration_minutes` is:
- Row's `duration_minutes` if not NULL
- Company default duration at **backfill time** if NULL (historical freeze)

---

## When to Use This Pattern

✅ **Use this pattern when:**
- Migrating datetime columns to Unix timestamps
- Existing datetime columns cause timezone ambiguity
- Numeric range queries are needed for performance
- Building reservation/booking systems

❌ **Consider alternatives when:**
- Data volume is small and downtime is acceptable
- Column is never queried by date range
- Legacy external dependencies prevent column removal

---

## Key Rules Summary

| Rule | Do | Don't |
|------|-----|-------|
| Index usage | `WHERE ts >= ?` | `WHERE UNIX_TIMESTAMP(ts) >= ?` |
| Timezone | outlet → company | UTC fallback |
| Write order | Dual write first | Read cutover first |
| Duration NULL | Freeze using company default at backfill time | Use current default |
| API compat | Keep `reservation_at` derived from `reservation_start_ts` | Remove without migration path |

---

## Related Documents

- [Epic 7: Reservations V2 Architecture](../epics/epic-07-reservations-v2.md)
- [Epic 12: Timestamp Migration](../epics/epic-12-timestamp-migration.md)
- [Schema Migration Guidelines](../standards/schema-migrations.md)
