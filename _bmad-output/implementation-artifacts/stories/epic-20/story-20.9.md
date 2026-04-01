# Story 20.9: Legacy Table Drops

**Status:** in-progress  
**Epic:** Epic 20  
**Story Points:** 1  
**Priority:** P2  
**Risk:** LOW  
**Assigned:** bmad-dev  

---

## Overview

Drop unused legacy tables that have no data and no dependencies: `analytics_insights`, `user_outlets`, and `sync_operations`. Verify no data exists before dropping.

## Technical Details

### Database Changes

```sql
-- Verify no data in analytics_insights
SELECT COUNT(*) FROM analytics_insights;
-- Result: 0 rows ✅ CAN DROP

-- Verify no data in user_outlets
SELECT COUNT(*) FROM user_outlets;
-- Result: 214 rows ❌ HAS DATA - CANNOT DROP

-- Verify no data in sync_operations
SELECT COUNT(*) FROM sync_operations;
-- Result: 0 rows ✅ BUT USED IN PRODUCTION CODE
```

### Files Changed

| File | Change |
|------|--------|
| `packages/db/src/kysely/legacy.ts` | Created - archived deprecated table definitions |
| `packages/db/src/kysely/schema.ts` | Removed AnalyticsInsights interface |
| `apps/api/src/lib/phase3-batch.test.ts` | Removed tests for dropped analytics_insights table |

## Implementation Findings

### Table Status

| Table | Row Count | Code References | Status |
|-------|----------|----------------|--------|
| `analytics_insights` | 0 | Test only | ✅ **DROPPED** - Schema updated, types archived |
| `user_outlets` | **214** | Test JOINs | ❌ **BLOCKED** - Has data, cannot drop |
| `sync_operations` | 0 | Production code (data-retention.job.ts) | ⚠️ **BLOCKED** - Epic incorrectly says "unused" |

### Critical Issues Found

1. **`user_outlets` has 214 rows of data** - Per story rules, cannot drop tables with data. This table must be cleaned up or migrated before it can be dropped.

2. **`sync_operations` is NOT unused** - The `data-retention.job.ts` file actively uses this table for cleanup operations. The epic incorrectly classified it as "unused". Before dropping this table, the retention job must be updated to either:
   - Remove `sync_operations` from `DEFAULT_RETENTION_POLICIES`, OR
   - Migrate to a different cleanup mechanism

## Migration Steps Completed

1. ✅ **Verified analytics_insights**: 0 rows
2. ✅ **Verified user_outlets**: 214 rows - cannot proceed
3. ✅ **Verified sync_operations**: 0 rows but IS referenced in production code
4. ✅ **Archived definitions**: Created `packages/db/src/kysely/legacy.ts` with deprecated types
5. ✅ **Updated schema**: Removed `AnalyticsInsights` from schema.ts
6. ✅ **Removed code references**: Removed two tests in phase3-batch.test.ts
7. ⚠️ **No code references these tables**: PARTIAL - `sync_operations` IS referenced in production code

## Acceptance Criteria

- [x] analytics_insights has no data (verified via SELECT COUNT) - **0 rows**
- [x] Table definitions archived in legacy types - **Created legacy.ts**
- [x] Schema updated to remove definitions - **AnalyticsInsights removed**
- [x] No production code references analytics_insights - **Only test refs removed**
- [x] Tests updated - **Removed 2 tests referencing analytics_insights**
- [ ] user_outlets has no data (verified via SELECT COUNT) - **214 rows - CANNOT DROP**
- [ ] sync_operations has no data (verified via SELECT COUNT) - **0 rows BUT production code uses it**
- [ ] No code references these tables - **sync_operations IS referenced in data-retention.job.ts**

## Remaining Work

### For user_outlets (Blocked by data):
- Either migrate/clean up the 214 rows
- Or determine if this table is actually needed

### For sync_operations (Blocked by code reference):
- Update `packages/sync-core/src/jobs/data-retention.job.ts` to remove sync_operations from DEFAULT_RETENTION_POLICIES
- Then can drop the table

## Dependencies

- Stories 20.3, 20.5, 20.7, 20.8 should complete first (quick wins)

---

## Dev Agent Record

### Implementation Notes

**Date:** 2026-04-01

**What was done:**
1. Verified database had 0 rows in `analytics_insights` ✅
2. Found 214 rows in `user_outlets` - blocked ❌
3. Found 0 rows in `sync_operations` but IS used in retention job - blocked ⚠️
4. Created `packages/db/src/kysely/legacy.ts` with deprecated type definitions
5. Removed `AnalyticsInsights` from schema.ts
6. Removed 2 tests from phase3-batch.test.ts that referenced analytics_insights
7. All typechecks and tests pass

**Files created:**
- `packages/db/src/kysely/legacy.ts` - Archived deprecated table types

**Files modified:**
- `packages/db/src/kysely/schema.ts` - Removed AnalyticsInsights interface
- `apps/api/src/lib/phase3-batch.test.ts` - Removed analytics_insights tests

**Story cannot be completed as written** due to:
1. `user_outlets` has data (214 rows) - cannot drop per story rules
2. `sync_operations` is actively used by data-retention.job.ts - epic classification is incorrect
