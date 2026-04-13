-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0158_acl_enforce_resource_not_null
-- Story: Epic 39 - Strict Full Enforcement for ACL Resource
-- Description: Enforce module_roles.resource NOT NULL safely and idempotently.
--              Expand legacy null-resource rows into resource-level rows, then delete remaining nulls,
--              finally alter column to NOT NULL.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- STEP 1: Ensure resource column exists (idempotent check)
-- ==============================================================================
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'module_roles' 
    AND column_name = 'resource'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE module_roles ADD COLUMN resource VARCHAR(100) NOT NULL DEFAULT ''''', 
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==============================================================================
-- STEP 2: Expand legacy module-level rows (resource IS NULL) into resource-level rows
-- using canonical module-resource mapping.
-- INSERT IGNORE ensures existing explicit resource rows are not overwritten.
-- ==============================================================================

-- platform module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'users', permission_mask
FROM module_roles WHERE module = 'platform' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'roles', permission_mask
FROM module_roles WHERE module = 'platform' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'companies', permission_mask
FROM module_roles WHERE module = 'platform' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'outlets', permission_mask
FROM module_roles WHERE module = 'platform' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'settings', permission_mask
FROM module_roles WHERE module = 'platform' AND resource IS NULL;

-- accounting module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'accounts', permission_mask
FROM module_roles WHERE module = 'accounting' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'journals', permission_mask
FROM module_roles WHERE module = 'accounting' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'fiscal_years', permission_mask
FROM module_roles WHERE module = 'accounting' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'reports', permission_mask
FROM module_roles WHERE module = 'accounting' AND resource IS NULL;

-- treasury module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'transactions', permission_mask
FROM module_roles WHERE module = 'treasury' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'accounts', permission_mask
FROM module_roles WHERE module = 'treasury' AND resource IS NULL;

-- sales module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'invoices', permission_mask
FROM module_roles WHERE module = 'sales' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'orders', permission_mask
FROM module_roles WHERE module = 'sales' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'payments', permission_mask
FROM module_roles WHERE module = 'sales' AND resource IS NULL;

-- inventory module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'items', permission_mask
FROM module_roles WHERE module = 'inventory' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'stock', permission_mask
FROM module_roles WHERE module = 'inventory' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'costing', permission_mask
FROM module_roles WHERE module = 'inventory' AND resource IS NULL;

-- pos module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'transactions', permission_mask
FROM module_roles WHERE module = 'pos' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'config', permission_mask
FROM module_roles WHERE module = 'pos' AND resource IS NULL;

-- reservations module
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'bookings', permission_mask
FROM module_roles WHERE module = 'reservations' AND resource IS NULL;

INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, module, 'tables', permission_mask
FROM module_roles WHERE module = 'reservations' AND resource IS NULL;

-- ==============================================================================
-- STEP 3: Delete remaining legacy null-resource rows
-- These are rows where resource IS NULL and no explicit resource row exists.
-- We only delete after expanding above to preserve any custom resource-level grants.
-- ==============================================================================
DELETE FROM module_roles WHERE resource IS NULL;

-- ==============================================================================
-- STEP 4: Alter resource to NOT NULL (guarded via information_schema)
-- ==============================================================================
SET @col_not_null = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'module_roles' 
    AND column_name = 'resource'
    AND is_nullable = 'NO'
);
SET @alter_sql = IF(@col_not_null = 0,
  'ALTER TABLE module_roles MODIFY COLUMN resource VARCHAR(100) NOT NULL',
  'SELECT 1'
);
PREPARE alter_stmt FROM @alter_sql;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- ==============================================================================
-- STEP 5: Verify final state
-- ==============================================================================
SET @null_count = (SELECT COUNT(*) FROM module_roles WHERE resource IS NULL);
SET @col_exists_final = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'module_roles' 
    AND column_name = 'resource'
    AND is_nullable = 'NO'
);
SELECT 
  IF(@null_count = 0, 'PASS: No NULL resources', CONCAT('FAIL: ', @null_count, ' NULL resources remain')) AS null_check,
  IF(@col_exists_final = 1, 'PASS: resource is NOT NULL', 'FAIL: resource is still nullable') AS not_null_check;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;