-- Migration: 0148_acl_complete_resource_migration.sql
-- Story: Epic 39 - Complete ACL Resource Migration
-- Description: Create resource-level permissions for inventory, sales, pos modules
--              Copying from existing module-level permissions to all resources
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- INVENTORY MODULE - Copy module-level to all resources
-- ==============================================================================

-- inventory.items
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'inventory', 'items', permission_mask
FROM module_roles
WHERE module = 'inventory' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory.stock
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'inventory', 'stock', permission_mask
FROM module_roles
WHERE module = 'inventory' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory.costing
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'inventory', 'costing', permission_mask
FROM module_roles
WHERE module = 'inventory' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- SALES MODULE - Copy module-level to all resources
-- ==============================================================================

-- sales.invoices
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'sales', 'invoices', permission_mask
FROM module_roles
WHERE module = 'sales' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales.orders
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'sales', 'orders', permission_mask
FROM module_roles
WHERE module = 'sales' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales.payments
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'sales', 'payments', permission_mask
FROM module_roles
WHERE module = 'sales' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- POS MODULE - Copy module-level to all resources
-- ==============================================================================

-- pos.transactions
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'pos', 'transactions', permission_mask
FROM module_roles
WHERE module = 'pos' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos.config
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'pos', 'config', permission_mask
FROM module_roles
WHERE module = 'pos' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- ACCOUNTING MODULE - Add missing reports resource
-- ==============================================================================

-- accounting.reports (based on accounting module-level permissions)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT company_id, role_id, 'accounting', 'reports', permission_mask
FROM module_roles
WHERE module = 'accounting' AND resource IS NULL
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
