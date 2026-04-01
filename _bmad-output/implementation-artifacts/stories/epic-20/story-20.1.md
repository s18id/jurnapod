# Story 20.1: Settings System Migration

**Status:** backlog  
**Epic:** Epic 20  
**Story Points:** 8  
**Priority:** P1  
**Risk:** HIGH  
**Assigned:** unassigned  

---

## Overview

Migrate the legacy `company_settings` and `platform_settings` tables to a new normalized three-table structure with typed values: `settings_strings`, `settings_numbers`, and `settings_booleans`. This is the highest-risk story in Epic 20 because settings touch all modules; it must be executed last after patterns are proven in other stories.

## Technical Details

### Database Changes

```sql
-- Create settings_strings table
CREATE TABLE settings_strings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_key (company_id, outlet_id, setting_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    CONSTRAINT fk_settings_strings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create settings_numbers table
CREATE TABLE settings_numbers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value DECIMAL(20, 6) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_key (company_id, outlet_id, setting_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    CONSTRAINT fk_settings_numbers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create settings_booleans table
CREATE TABLE settings_booleans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value TINYINT(1) DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_key (company_id, outlet_id, setting_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    CONSTRAINT fk_settings_booleans_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: Copy data from company_settings
-- String values
INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
SELECT company_id, outlet_id, setting_key, setting_value, created_at, updated_at
FROM company_settings
WHERE setting_type = 'string'
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Number values
INSERT INTO settings_numbers (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
SELECT company_id, outlet_id, setting_key, CAST(setting_value AS DECIMAL(20, 6)), created_at, updated_at
FROM company_settings
WHERE setting_type = 'number'
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Boolean values
INSERT INTO settings_booleans (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
SELECT company_id, outlet_id, setting_key, CAST(setting_value AS TINYINT(1)), created_at, updated_at
FROM company_settings
WHERE setting_type = 'boolean'
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Migration: Copy data from platform_settings
INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
SELECT NULL, NULL, setting_key, setting_value, created_at, updated_at
FROM platform_settings
WHERE setting_type = 'string'
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

INSERT INTO settings_numbers (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
SELECT NULL, NULL, setting_key, CAST(setting_value AS DECIMAL(20, 6)), created_at, updated_at
FROM platform_settings
WHERE setting_type = 'number'
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

INSERT INTO settings_booleans (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
SELECT NULL, NULL, setting_key, CAST(setting_value AS TINYINT(1)), created_at, updated_at
FROM platform_settings
WHERE setting_type = 'boolean'
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Drop old tables (after verification)
-- DROP TABLE IF EXISTS company_settings;
-- DROP TABLE IF EXISTS platform_settings;
```

### Files to Change

| File | Change |
|------|--------|
| `apps/api/src/lib/settings.ts` | Rewrite to use new typed tables |
| `apps/api/src/lib/platform-settings.ts` | Rewrite to use new typed tables |
| `apps/api/src/routes/settings.ts` | Update route handlers |
| `apps/api/src/routes/platform-settings.ts` | Update route handlers |
| `packages/shared/src/types/settings.ts` | Add typed interfaces |
| `packages/shared/src/db/schema.ts` | Add table definitions |

### Migration Steps

1. **Backup**: Full database backup before migration
2. **Create**: Create new settings_strings, settings_numbers, settings_booleans tables
3. **Migrate**: Copy data from company_settings and platform_settings
4. **Verify**: Query both old and new tables, compare counts
5. **Update code**: Update lib/settings.ts and lib/platform-settings.ts
6. **Update routes**: Update route handlers to use new tables
7. **Update types**: Add shared types for new structure
8. **Test**: Run settings-related tests
9. **Deploy**: Deploy code changes
10. **Drop**: Drop old tables after 48h monitoring

## Acceptance Criteria

- [ ] New settings_strings, settings_numbers, settings_booleans tables created
- [ ] All data from company_settings migrated correctly
- [ ] All data from platform_settings migrated correctly (with NULL company_id/outlet_id)
- [ ] lib/settings.ts updated and passing tests
- [ ] lib/platform-settings.ts updated and passing tests
- [ ] Route handlers updated
- [ ] Shared types updated
- [ ] No data loss verified (row counts match before/after)
- [ ] Old tables dropped only after full verification

## Dependencies

- Epic 20 stories 20.2-20.9 must be complete first (settings is HIGH risk, do last)
