-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Backfill POS module permissions for existing seeded companies.
-- This migration repairs companies that were seeded without pos module permissions
-- (specifically missing module_roles entries for the 'pos' module) and ensures
-- COMPANY_ADMIN role exists for seed parity.

-- Step 1: Ensure POS module exists
INSERT IGNORE INTO modules (code, name, description)
VALUES ('pos', 'POS', 'Point of sale');

-- Step 2: Ensure system COMPANY_ADMIN role exists and has expected attributes
UPDATE roles
SET name = 'Company Admin',
    is_global = 1,
    role_level = 80
WHERE code = 'COMPANY_ADMIN'
  AND company_id IS NULL;

INSERT INTO roles (company_id, code, name, is_global, role_level)
SELECT NULL, 'COMPANY_ADMIN', 'Company Admin', 1, 80
WHERE NOT EXISTS (
  SELECT 1
  FROM roles
  WHERE code = 'COMPANY_ADMIN'
    AND company_id IS NULL
);

-- Step 3: Ensure POS is enabled for all companies
INSERT IGNORE INTO company_modules (company_id, module_id, enabled, config_json)
SELECT
  c.id AS company_id,
  m.id AS module_id,
  1 AS enabled,
  '{"payment_methods":["CASH"]}' AS config_json
FROM companies c
INNER JOIN modules m ON m.code = 'pos';

-- Step 4: Backfill missing POS module permissions per default role policy
-- Permission mask: create=1, read=2, update=4, delete=8
-- 15 = full access, 3 = create+read, 2 = read-only
-- NOTE: Only targets system roles (r.company_id IS NULL), not custom company roles
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT
  c.id AS company_id,
  r.id AS role_id,
  'pos' AS module,
  CASE r.code
    WHEN 'SUPER_ADMIN' THEN 15
    WHEN 'OWNER' THEN 15
    WHEN 'COMPANY_ADMIN' THEN 15
    WHEN 'ADMIN' THEN 15
    WHEN 'CASHIER' THEN 3
    WHEN 'ACCOUNTANT' THEN 2
  END AS permission_mask
FROM companies c
INNER JOIN roles r
  ON r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT')
  AND r.company_id IS NULL;

-- Step 5: Targeted repair only for OWNER/COMPANY_ADMIN missing pos:create
-- Does NOT overwrite intentional ACL customizations for other roles
UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
SET mr.permission_mask = 15
WHERE mr.module = 'pos'
  AND r.company_id IS NULL
  AND r.code IN ('OWNER', 'COMPANY_ADMIN')
  AND (mr.permission_mask & 1) = 0;
