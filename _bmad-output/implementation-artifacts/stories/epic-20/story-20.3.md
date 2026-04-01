# Story 20.3: Feature Flags Normalization

**Status:** done  
**Epic:** Epic 20  
**Story Points:** 3  
**Priority:** P2  
**Risk:** LOW  
**Assigned:** unassigned  

---

## Overview

Normalize the `feature_flags` table by replacing the `config_json` column with explicit typed columns for rollout percentage, target segments, start/end dates. This is a quick win with LOW risk.

## Technical Details

### Database Changes

```sql
-- Add explicit columns to feature_flags (additive, then drop config_json after migration)
ALTER TABLE feature_flags
    ADD COLUMN rollout_percentage INT DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    ADD COLUMN target_segments JSON NULL COMMENT 'Array of segment IDs for targeted rollout',
    ADD COLUMN start_at DATETIME NULL,
    ADD COLUMN end_at DATETIME NULL,
    ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add index for efficient queries
CREATE INDEX idx_feature_flags_active ON feature_flags (is_active, start_at, end_at);

-- Migration: Populate new columns from config_json
UPDATE feature_flags SET
    rollout_percentage = COALESCE(JSON_EXTRACT(config_json, '$.rollout_percentage'), 100),
    target_segments = JSON_EXTRACT(config_json, '$.target_segments'),
    start_at = JSON_EXTRACT(config_json, '$.start_at'),
    end_at = JSON_EXTRACT(config_json, '$.end_at')
WHERE config_json IS NOT NULL;

-- Drop config_json column after verification
-- ALTER TABLE feature_flags DROP COLUMN config_json;
```

### Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/db/schema.ts` | Update feature_flags definition |
| `apps/api/src/lib/features.ts` | Update to use explicit columns |
| `apps/api/src/routes/features.ts` | Update route handlers |

### Migration Steps

1. **Add columns**: Add rollout_percentage, target_segments, start_at, end_at
2. **Add index**: Create index for active/date queries
3. **Migrate data**: Populate columns from config_json
4. **Update code**: Update lib/features.ts
5. **Update routes**: Update feature flags route handlers
6. **Update schema**: Update shared DB schema types
7. **Test**: Run feature-related tests
8. **Drop column**: Remove config_json after verification

## Acceptance Criteria

- [ ] rollout_percentage column added with DEFAULT 100
- [ ] target_segments JSON column added
- [ ] start_at and end_at DATETIME columns added
- [ ] Migration script populates new columns correctly
- [ ] lib/features.ts updated to use explicit columns
- [ ] Route handlers updated
- [ ] config_json dropped only after full verification
- [ ] Tests passing

## Dependencies

- None (can run independently as a quick win)
