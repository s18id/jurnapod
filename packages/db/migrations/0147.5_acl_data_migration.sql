-- Migration: 0147.5_acl_data_migration.sql
-- Story: Epic 39, Story 39.3.5 - Phase 1D — Data Migration — Convert Existing Module Roles
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Map old module codes to new module codes with resources while maintaining
--              backward compatibility during the transition period.
--
-- ROLLBACK PLAN:
-- This migration transforms existing module_roles data.
-- Rollback requires PITR from database backup.
--
-- Compensating SQL (partial recovery):
-- DELETE FROM module_roles WHERE module = 'platform' AND resource IN ('users', 'roles', 'companies', 'outlets', 'settings');
-- DELETE FROM module_roles WHERE module = 'accounting' AND resource IN ('accounts', 'journals');
-- DELETE FROM module_roles WHERE module = 'treasury' AND resource = 'transactions';
-- Note: Old entries still exist due to dual-write strategy

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- Step 0: Ensure resource column exists (self-contained; 0147 also adds it)
-- ==============================================================================
SET @resource_col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'module_roles'
    AND column_name = 'resource'
);
SET @sql = IF(@resource_col_exists = 0,
  'ALTER TABLE module_roles ADD COLUMN resource VARCHAR(64) NULL AFTER module',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==============================================================================
-- Step 1: Insert new platform module entries
-- Maps: users -> platform.users, roles -> platform.roles, companies -> platform.companies,
--       outlets -> platform.outlets, settings -> platform.settings
-- ==============================================================================

-- platform.users (from users)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'users', permission_mask
FROM module_roles
WHERE module = 'users'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.roles (from roles)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'roles', permission_mask
FROM module_roles
WHERE module = 'roles'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.companies (from companies)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'companies', permission_mask
FROM module_roles
WHERE module = 'companies'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.outlets (from outlets)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'outlets', permission_mask
FROM module_roles
WHERE module = 'outlets'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- platform.settings (from settings)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'platform', 'settings', permission_mask
FROM module_roles
WHERE module = 'settings'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- Step 2: Insert new accounting module entries
-- Maps: accounts -> accounting.accounts, journals -> accounting.journals
-- ==============================================================================

-- accounting.accounts (from accounts)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'accounting', 'accounts', permission_mask
FROM module_roles
WHERE module = 'accounts'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting.journals (from journals)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'accounting', 'journals', permission_mask
FROM module_roles
WHERE module = 'journals'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- Step 3: Insert new treasury module entries
-- Maps: cash_bank -> treasury.transactions
-- ==============================================================================

-- treasury.transactions (from cash_bank)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'treasury', 'transactions', permission_mask
FROM module_roles
WHERE module = 'cash_bank'
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- Step 4: Handle module-level entries (NULL resource)
-- inventory, sales, pos: Keep as NULL resource during transition period
-- Stories 39.6, 39.8, 39.9 will update these to resource-level
-- ==============================================================================

-- inventory module-level (keep existing NULL resource entries as-is)
-- No transformation needed - inventory already has NULL resource in some cases

-- sales module-level (keep existing NULL resource entries as-is)

-- pos module-level (keep existing NULL resource entries as-is)

-- ==============================================================================
-- Step 5: Delete reports module entries
-- ==============================================================================

DELETE FROM module_roles WHERE module = 'reports';
DELETE FROM modules WHERE code = 'reports';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
