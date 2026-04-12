-- Migration: 0149_fix_owner_permissions.sql
-- Story: Epic 39 - Fix OWNER role permissions with correct bit values
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: 
--   1. Insert missing OWNER module_roles entries with correct Epic 39 permission bits
--   2. Uses CRUDAM=63 for all OWNER permissions to all module.resources
--
-- Note: Uses ON DUPLICATE KEY UPDATE to be idempotent
-- Note: module_roles has UNIQUE KEY on (company_id, role_id, module) - no resource column
--       So we insert/update with resource=NULL for backward compatibility

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Step 1: Insert OWNER permissions for platform module (company_id=1 is the demo company)
-- platform.users - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'platform', 'users', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- platform.roles - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'platform', 'roles', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- platform.outlets - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'platform', 'outlets', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- platform.settings - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'platform', 'settings', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- Step 2: Insert OWNER permissions for accounting module
-- accounting.accounts - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'accounting', 'accounts', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- accounting.journals - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'accounting', 'journals', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- accounting.fiscal_years - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'accounting', 'fiscal_years', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- accounting.reports - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'accounting', 'reports', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- Step 3: Insert OWNER permissions for treasury module
-- treasury.transactions - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'treasury', 'transactions', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- treasury.accounts - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'treasury', 'accounts', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- Step 4: Insert OWNER permissions for sales module
-- sales.invoices - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'sales', 'invoices', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- sales.orders - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'sales', 'orders', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- sales.payments - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'sales', 'payments', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- Step 5: Insert OWNER permissions for inventory module
-- inventory.items - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'inventory', 'items', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- inventory.stock - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'inventory', 'stock', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- inventory.costing - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'inventory', 'costing', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- Step 6: Insert OWNER permissions for pos module
-- pos.transactions - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'pos', 'transactions', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- pos.config - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'pos', 'config', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- Step 7: Insert OWNER permissions for reservations module
-- reservations.bookings - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'reservations', 'bookings', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

-- reservations.tables - CRUDAM=63
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask, updated_at)
SELECT 1, r.id, 'reservations', 'tables', 63, CURRENT_TIMESTAMP
FROM roles r
WHERE r.code = 'OWNER' AND r.company_id IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask), updated_at = CURRENT_TIMESTAMP;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;