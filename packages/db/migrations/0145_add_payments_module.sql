-- Migration: 0145_add_payments_module.sql
-- Description: Add payments module and backfill module_roles for all existing companies
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- ==============================================================================
-- Step 1: Add payments module to modules table
-- ==============================================================================

INSERT INTO modules (code, name, description)
VALUES ('payments', 'Payments', 'Sales payment recording and settlement')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

-- ==============================================================================
-- Step 2: Enable payments module for all existing companies
-- ==============================================================================

INSERT INTO company_modules (company_id, module_id, enabled, config_json, created_by_user_id)
SELECT c.id, m.id, 1, '{}', NULL
FROM companies c
CROSS JOIN modules m
WHERE m.code = 'payments'
  AND NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = c.id AND cm.module_id = m.id
  );

-- ==============================================================================
-- Step 3: Grant full permissions (mask 15 = create+read+update+delete) to OWNER and COMPANY_ADMIN
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'payments', c.id, 15
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('OWNER', 'COMPANY_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id
      AND mr.module = 'payments'
      AND mr.company_id = c.id
  );

-- Also UPDATE existing entries to correct mask (in case they have wrong values)
UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = 15
WHERE mr.module = 'payments'
  AND r.code IN ('OWNER', 'COMPANY_ADMIN')
  AND mr.permission_mask <> 15;

-- ==============================================================================
-- Step 4: Grant read+create+update permissions (mask 7) to ADMIN and ACCOUNTANT
-- Note: ADMIN and ACCOUNTANT get CRUD without delete for payments
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'payments', c.id, 7
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('ADMIN', 'ACCOUNTANT')
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id
      AND mr.module = 'payments'
      AND mr.company_id = c.id
  );

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = 7
WHERE mr.module = 'payments'
  AND r.code IN ('ADMIN', 'ACCOUNTANT')
  AND mr.permission_mask <> 7;

-- ==============================================================================
-- Step 5: Grant read+create permissions (mask 3) to CASHIER
-- CASHIER can create and read payments but not update/delete
-- ==============================================================================

INSERT INTO module_roles (role_id, module, company_id, permission_mask)
SELECT r.id, 'payments', c.id, 3
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'CASHIER'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.role_id = r.id
      AND mr.module = 'payments'
      AND mr.company_id = c.id
  );

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = 3
WHERE mr.module = 'payments'
  AND r.code = 'CASHIER'
  AND mr.permission_mask <> 3;
