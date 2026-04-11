-- Migration: 0147_acl_reorganization.sql
-- Story: Epic 39, Story 39.3 - ACL Reorganization Phase 1C
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Add resource column to module_roles table, update unique constraints,
--              add indexes for resource-level permission lookups, and remove reports module.
--
-- ROLLBACK PLAN:
-- This migration involves data deletion (DELETE FROM modules WHERE code = 'reports')
-- which cannot be directly reversed.
--
-- Alternative compensating SQL (partial recovery):
-- INSERT INTO modules (code, name, description)
-- VALUES ('reports', 'Reports', 'Reporting and analytics')
-- ON DUPLICATE KEY UPDATE name = VALUES(name);
--
-- For complete rollback, restore from PITR backup.

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- Step 1: Add resource column to module_roles table
-- ==============================================================================

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'module_roles'
    AND column_name = 'resource'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE module_roles ADD COLUMN resource VARCHAR(64) NULL AFTER module',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==============================================================================
-- Step 2: Drop old unique constraint and add new one with resource column
-- The new unique key (company_id, role_id, module, resource) allows multiple NULL
-- resources (which means module-level permission, backward compatible).
-- ==============================================================================

-- Determine which unique index exists on module_roles
SET @idx_old_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'uq_module_roles_company_role_module'
);

SET @idx_alt_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'uq_module_role'
);

-- Drop the old unique index if it exists (handle both possible names)
SET @drop_sql = IF(@idx_old_exists = 1,
  'ALTER TABLE module_roles DROP INDEX uq_module_roles_company_role_module',
  IF(@idx_alt_exists = 1,
    'ALTER TABLE module_roles DROP INDEX uq_module_role',
    'SELECT 1'
  )
);
PREPARE drop_stmt FROM @drop_sql;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

-- Add new unique index that includes resource column
SET @new_idx_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'uq_module_role'
);

SET @add_idx_sql = IF(@new_idx_exists = 0,
  'ALTER TABLE module_roles ADD UNIQUE INDEX uq_module_role (company_id, role_id, module, resource)',
  'SELECT 1'
);
PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- ==============================================================================
-- Step 3: Add index on resource column for lookup performance
-- ==============================================================================

SET @resource_idx_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'idx_resource'
);
SET @add_resource_idx = IF(@resource_idx_exists = 0,
  'ALTER TABLE module_roles ADD INDEX idx_resource (resource)',
  'SELECT 1'
);
PREPARE resource_idx_stmt FROM @add_resource_idx;
EXECUTE resource_idx_stmt;
DEALLOCATE PREPARE resource_idx_stmt;

-- ==============================================================================
-- Step 4: Remove reports module from modules table
-- Note: This is data deletion. The reports module permissions will need to be
-- reassigned to source modules (e.g., sales.ANALYZE, accounting.ANALYZE).
-- ==============================================================================

DELETE FROM modules WHERE code = 'reports';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
