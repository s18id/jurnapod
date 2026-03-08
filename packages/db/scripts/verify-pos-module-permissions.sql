-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Verification script for POS module permissions
-- Run this after applying migration 0068 to verify all roles have POS module access

-- Check 1: Verify POS module exists in modules table
SELECT 
  'POS Module Exists' AS check_name,
  CASE 
    WHEN COUNT(*) > 0 THEN 'PASS'
    ELSE 'FAIL - POS module not found in modules table'
  END AS status,
  COUNT(*) AS count
FROM modules
WHERE code = 'pos';

-- Check 2: Count of companies
SELECT 
  'Total Companies' AS metric,
  COUNT(*) AS count
FROM companies;

-- Check 3: Count of companies with POS module enabled
SELECT 
  'Companies with POS Module Enabled' AS metric,
  COUNT(DISTINCT cm.company_id) AS count
FROM company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
WHERE m.code = 'pos'
  AND cm.enabled = 1;

-- Check 4: Identify companies missing POS module in company_modules
SELECT 
  c.id AS company_id,
  c.code AS company_code,
  c.name AS company_name,
  'MISSING POS MODULE' AS issue
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 
  FROM company_modules cm
  INNER JOIN modules m ON m.id = cm.module_id
  WHERE cm.company_id = c.id
    AND m.code = 'pos'
);

-- Count of POS module_roles entries per role
SELECT 
  r.code AS role_code,
  COUNT(DISTINCT mr.company_id) AS companies_with_permission,
  mr.permission_mask,
  CASE mr.permission_mask
    WHEN 15 THEN 'Full (Create, Read, Update, Delete)'
    WHEN 3 THEN 'Create + Read'
    WHEN 2 THEN 'Read Only'
    ELSE CONCAT('Custom (', mr.permission_mask, ')')
  END AS permission_description
FROM roles r
LEFT JOIN module_roles mr ON mr.role_id = r.id AND mr.module = 'pos'
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT')
GROUP BY r.code, mr.permission_mask
ORDER BY 
  FIELD(r.code, 'SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT');

-- Check for any companies missing POS permissions for key roles
SELECT 
  c.id AS company_id,
  c.code AS company_code,
  c.name AS company_name,
  r.code AS role_code,
  CASE 
    WHEN mr.id IS NULL THEN 'MISSING'
    ELSE 'OK'
  END AS status
FROM companies c
CROSS JOIN roles r
LEFT JOIN module_roles mr 
  ON mr.company_id = c.id 
  AND mr.role_id = r.id 
  AND mr.module = 'pos'
WHERE r.code IN ('OWNER', 'COMPANY_ADMIN', 'ADMIN')
  AND mr.id IS NULL
ORDER BY c.id, r.code;

-- Detailed view of all POS module permissions
SELECT 
  c.id AS company_id,
  c.code AS company_code,
  r.code AS role_code,
  mr.permission_mask,
  (mr.permission_mask & 1) > 0 AS can_create,
  (mr.permission_mask & 2) > 0 AS can_read,
  (mr.permission_mask & 4) > 0 AS can_update,
  (mr.permission_mask & 8) > 0 AS can_delete
FROM companies c
CROSS JOIN roles r
LEFT JOIN module_roles mr 
  ON mr.company_id = c.id 
  AND mr.role_id = r.id 
  AND mr.module = 'pos'
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT')
ORDER BY c.id, FIELD(r.code, 'SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT');
