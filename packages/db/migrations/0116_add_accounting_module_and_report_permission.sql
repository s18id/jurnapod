-- Migration: 0116_add_accounting_module_and_report_permission.sql
-- Description: Add accounting module and report permission bit for POS and accounting modules
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- ==============================================================================
-- Step 1: Add accounting module to modules table
-- ==============================================================================

INSERT INTO modules (code, name, description)
VALUES ('accounting', 'Accounting', 'Accounting and financial reporting')
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  description = VALUES(description);

-- ==============================================================================
-- Step 2: Enable accounting module for all companies
-- ==============================================================================

INSERT INTO company_modules (company_id, module_id, enabled, config_json, created_by_user_id)
SELECT c.id, m.id, 1, '{}', NULL
FROM companies c
CROSS JOIN modules m
WHERE m.code = 'accounting'
  AND NOT EXISTS (
    SELECT 1 FROM company_modules cm 
    WHERE cm.company_id = c.id AND cm.module_id = m.id
  );

-- ==============================================================================
-- Step 3: Add report permission (bit 16) to existing POS module_roles entries
-- For roles that already have POS module access, add the report bit
-- Existing permissions: 2 (read), 3 (read+create), 15 (full), etc.
-- New permissions: existing + 16 (add report bit)
-- ==============================================================================

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'pos'
  AND (mr.permission_mask & 16) = 0;  -- Only update if report bit not already set

-- ==============================================================================
-- Step 3b: Add POS module with report permission for roles that don't have POS entry yet
-- This includes OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT who may not have had POS entries
-- Permission mask: read(2) + report(16) = 18
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'pos', c.id, 18  -- read + report
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr 
    WHERE mr.role_id = r.id 
      AND mr.module = 'pos' 
      AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 4: Add accounting module with report permission for ACCOUNTANT and ADMIN roles
-- Permission mask: read(2) + report(16) = 18
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'accounting', c.id, 18  -- read + report
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('ACCOUNTANT', 'ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr 
    WHERE mr.role_id = r.id 
      AND mr.module = 'accounting' 
      AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 5: Add OWNER and COMPANY_ADMIN roles with full permissions for accounting
-- Permission mask: create(1) + read(2) + update(4) + delete(8) + report(16) = 31
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'accounting', c.id, 31  -- full access + report
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('OWNER', 'COMPANY_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr 
    WHERE mr.role_id = r.id 
      AND mr.module = 'accounting' 
      AND mr.company_id = c.id
  );

-- ==============================================================================
-- Step 6: Ensure CASHIER has report permission on POS module
-- (May already be set in step 3, but ensure it's explicit)
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'pos', c.id, 18  -- read + report
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'CASHIER'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr 
    WHERE mr.role_id = r.id 
      AND mr.module = 'pos' 
      AND mr.company_id = c.id
  );

-- Or if CASHIER already has POS permissions, just add report bit
UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = mr.permission_mask | 16
WHERE mr.module = 'pos'
  AND r.code = 'CASHIER'
  AND (mr.permission_mask & 16) = 0;
