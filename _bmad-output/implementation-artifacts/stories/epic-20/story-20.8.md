# Story 20.8: Data Import Count Columns

**Status:** review  
**Epic:** Epic 20  
**Story Points:** 2  
**Priority:** P2  
**Risk:** LOW  
**Assigned:** unassigned  

---

## Overview

Add `total_rows`, `success_count`, `error_count`, and `warning_count` columns to the `data_imports` table to provide better progress tracking and error reporting without querying the detailed import_lines table.

## Technical Details

### Database Changes

```sql
-- Add count columns to data_imports
ALTER TABLE data_imports
    ADD COLUMN total_rows INT UNSIGNED DEFAULT 0,
    ADD COLUMN success_count INT UNSIGNED DEFAULT 0,
    ADD COLUMN error_count INT UNSIGNED DEFAULT 0,
    ADD COLUMN warning_count INT UNSIGNED DEFAULT 0,
    ADD COLUMN processed_rows INT UNSIGNED GENERATED ALWAYS AS (success_count + error_count) STORED,
    ADD COLUMN completion_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_rows > 0 THEN (processed_rows / total_rows) * 100 ELSE 0 END
    ) STORED;
```

### Files Actually Changed

| File | Change |
|------|--------|
| `packages/db/migrations/0133_story_20_8_data_import_count_columns.sql` | New migration to add count columns |
| `packages/db/src/kysely/schema.ts` | Updated DataImports interface |
| `apps/api/src/lib/accounting-import.ts` | Updated to populate count columns on import completion |

### Migration Steps

1. **Add columns**: Add total_rows, success_count, error_count, warning_count
2. **Add computed columns**: Add processed_rows and completion_percentage
3. **Backfill counts**: Calculate from existing counts_json data
4. **Update accounting-import**: Populate counts during import
5. **Update schema**: Update DB schema TypeScript interface
6. **Test**: Run import tests

## Acceptance Criteria

- [x] total_rows column added
- [x] success_count column added
- [x] error_count column added
- [x] warning_count column added
- [x] Computed columns (processed_rows, completion_percentage) added
- [x] Backfill script calculates correct counts from counts_json
- [x] accounting-import.ts updated to populate counts
- [x] Schema updated (packages/db/src/kysely/schema.ts)
- [x] Tests passing

## Dependencies

- None (can run independently as a quick win)

---

## Dev Agent Record

### Implementation Summary

Implemented count columns for `data_imports` table to enable progress tracking without querying detail tables.

### Files Created/Modified

| File | Action |
|------|--------|
| `packages/db/migrations/0133_story_20_8_data_import_count_columns.sql` | Created |
| `packages/db/src/kysely/schema.ts` | Modified |
| `apps/api/src/lib/accounting-import.ts` | Modified |

### Test Evidence

- Import route tests: 52 tests passed
- DB package typecheck: Passed
- DB package build: Passed
- Lint on modified files: No errors

### Notes

- The `batch-operations.ts` and `session.ts` mentioned in the original story spec are for items/prices imports (import_sessions table), not accounting imports (data_imports table). The accounting import logic is in `accounting-import.ts`.
- The backfill derives total_rows from the sum of accounts + trns + alk in the existing counts_json.
- For completed imports, success_count = total_rows; for incomplete imports, error_count is set to 1.
