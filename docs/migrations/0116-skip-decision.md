# Migration 0116 Skip Decision

**Date:** 2026-03-16  
**Decision:** Skip migration `0116_standardize_datetime_storage.sql`  
**Reason:** Migration failed with "Duplicate column name 'start_date'" error due to partial state from previous attempts

---

## Current State

**Migration Status:**
- ✅ Migration 0053: Created fiscal_years table with DATE columns
- ❌ Migration 0116: FAILED - attempting to convert DATE to DATETIME
- ✅ Migration 0119: Successfully applied - fixed columns as DATETIME NULL

**Database State:**
- `fiscal_years` table exists and is functional
- `start_date` and `end_date` columns are DATETIME NULL (from 0119)
- Application code works correctly with current schema

---

## Why Skip 0116

1. **Migration 0119 Already Fixed the Issue**
   - Columns are now DATETIME (not DATE)
   - NULL constraint allows flexibility
   - Data is preserved

2. **0116 Cannot Be Applied Safely**
   - Partial state from previous failed runs
   - "Duplicate column" errors prevent completion
   - Complex nested SQL caused syntax issues

3. **Current Schema is Functional**
   - Company creation works
   - Fiscal year operations work
   - No data loss

---

## How to Skip

### Option A: Manual Database Entry (Recommended)

```sql
-- Add to schema_migrations table
INSERT INTO schema_migrations (version, applied_at) 
VALUES ('0116', NOW());
```

### Option B: Rename File (Alternative)

```bash
mv packages/db/migrations/0116_standardize_datetime_storage.sql \
   packages/db/migrations/0116_standardize_datetime_storage.sql.skipped
```

---

## Future Considerations

### For New Database Environments:

**Option 1: Run 0116 on fresh databases only**
- Keep 0116 in migrations folder
- Run `npm run db:migrate` on new environments
- They'll get proper DATETIME columns from the start

**Option 2: Create atomic swap migration (0120)**
- Create new migration that uses atomic table swap
- Handles both existing and new databases
- Cleanest long-term solution

### Recommended Path:

**Short-term:** Skip 0116, rely on 0119  
**Long-term:** Create migration 0120 with atomic table swap when:
- Setting up new production environment
- Major schema overhaul
- Time to clean up technical debt

---

## Related Files

- `packages/db/migrations/0053_fiscal_years.sql` - Original table creation
- `packages/db/migrations/0116_standardize_datetime_storage.sql` - SKIPPED
- `packages/db/migrations/0119_fix_fiscal_years_columns.sql` - APPLIED (fix)
- `packages/backoffice-sync/src/core/backoffice-data-service.ts` - Fixed bug (is_active → status)

---

## Notes

- Migration 0119 is idempotent and rerunnable
- Current schema supports all application features
- No immediate action required
- Decision can be revisited when creating new environments

---

**Decision Record:**  
Decision made by: Development team  
Date: 2026-03-16  
Rationale: Migration 0116 in broken state, 0119 provides working solution  
Next Review: When setting up new production environment
