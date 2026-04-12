-- Migration: 0154_fix_company_admin_permissions.sql
-- Description: Fix COMPANY_ADMIN role permissions for non-platform modules
--              COMPANY_ADMIN should have full CRUDAM (63) access outside platform
--              This fixes entries that have 31 (CRUDA), 33 (READ+MANAGE), or 15 (CRUD)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: YES

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- Fix COMPANY_ADMIN permissions for non-platform modules
-- Before: Various (31, 33, 15)
-- After: 63 (CRUDAM) for all non-platform modules
-- ==============================================================================

-- Log before state
SELECT 'BEFORE: COMPANY_ADMIN non-platform permissions' AS msg;
SELECT r.code AS role, mr.module, mr.resource, mr.permission_mask, COUNT(*) as cnt
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE r.code = 'COMPANY_ADMIN'
  AND mr.module != 'platform'
GROUP BY r.code, mr.module, mr.resource, mr.permission_mask;

-- Update COMPANY_ADMIN permissions for non-platform modules to CRUDAM (63)
UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = 63
WHERE r.code = 'COMPANY_ADMIN'
  AND mr.module != 'platform';

-- Log after state
SELECT 'AFTER: COMPANY_ADMIN non-platform permissions' AS msg;
SELECT r.code AS role, mr.module, mr.resource, mr.permission_mask, COUNT(*) as cnt
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE r.code = 'COMPANY_ADMIN'
  AND mr.module != 'platform'
GROUP BY r.code, mr.module, mr.resource, mr.permission_mask;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;