-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add POS module permissions to all existing roles
-- This migration ensures that existing companies have the necessary module_roles
-- entries for the POS module, including access to outlet tables and reservations.

-- Permission mask breakdown:
-- 1 = create
-- 2 = read
-- 4 = update
-- 8 = delete
-- 15 = full access (create + read + update + delete)
-- 3 = create + read
-- 2 = read only

-- Step 1: Ensure the POS module exists in the modules table
INSERT IGNORE INTO modules (code, name, description)
VALUES ('pos', 'POS', 'Point of sale');

-- Step 2: Ensure all companies have the POS module enabled in company_modules
INSERT IGNORE INTO company_modules (company_id, module_id, enabled, config_json)
SELECT 
  c.id AS company_id,
  m.id AS module_id,
  1 AS enabled,
  '{"payment_methods":["CASH"]}' AS config_json
FROM companies c
CROSS JOIN modules m
WHERE m.code = 'pos'
  AND NOT EXISTS (
    SELECT 1 FROM company_modules cm
    WHERE cm.company_id = c.id
      AND cm.module_id = m.id
  );

-- SUPER_ADMIN: Full POS access (15)
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT DISTINCT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  15 AS permission_mask
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.company_id = c.id
      AND mr.role_id = r.id
      AND mr.module = 'pos'
  );

-- OWNER: Full POS access (15)
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT DISTINCT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  15 AS permission_mask
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'OWNER'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.company_id = c.id
      AND mr.role_id = r.id
      AND mr.module = 'pos'
  );

-- COMPANY_ADMIN: Full POS access (15)
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT DISTINCT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  15 AS permission_mask
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'COMPANY_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.company_id = c.id
      AND mr.role_id = r.id
      AND mr.module = 'pos'
  );

-- ADMIN: Full POS access (15)
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT DISTINCT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  15 AS permission_mask
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.company_id = c.id
      AND mr.role_id = r.id
      AND mr.module = 'pos'
  );

-- CASHIER: Create + Read access only (3)
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT DISTINCT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  3 AS permission_mask
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'CASHIER'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.company_id = c.id
      AND mr.role_id = r.id
      AND mr.module = 'pos'
  );

-- ACCOUNTANT: Read only access (2)
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT DISTINCT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  2 AS permission_mask
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ACCOUNTANT'
  AND NOT EXISTS (
    SELECT 1 FROM module_roles mr
    WHERE mr.company_id = c.id
      AND mr.role_id = r.id
      AND mr.module = 'pos'
  );
