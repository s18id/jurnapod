-- Migration: 0153_fix_owner_platform_companies_permission.sql
-- Description: Fix OWNER role permission on platform.companies
--              Change from CRUDAM (63) to READ+UPDATE (5)
--              CREATE is reserved for SUPER_ADMIN only
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: YES

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- Fix OWNER platform.companies permission
-- Before: CRUDAM (63) - allows create which should be SUPER_ADMIN only
-- After: READ(1) | UPDATE(4) = 5
-- ==============================================================================

-- Log before state
SELECT 'BEFORE: OWNER platform.companies permission' AS msg;
SELECT mr.id, mr.company_id, r.code AS role_code, mr.module, mr.resource, mr.permission_mask
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE r.code = 'OWNER'
  AND mr.module = 'platform'
  AND mr.resource = 'companies';

-- Update OWNER platform.companies permission to READ | UPDATE (5)
UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = 5
WHERE r.code = 'OWNER'
  AND mr.module = 'platform'
  AND mr.resource = 'companies';

-- Log after state
SELECT 'AFTER: OWNER platform.companies permission' AS msg;
SELECT mr.id, mr.company_id, r.code AS role_code, mr.module, mr.resource, mr.permission_mask
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE r.code = 'OWNER'
  AND mr.module = 'platform'
  AND mr.resource = 'companies';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;