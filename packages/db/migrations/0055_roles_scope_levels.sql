-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'roles'
      AND column_name = 'is_global'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE roles ADD COLUMN is_global TINYINT(1) NOT NULL DEFAULT 0 AFTER name'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'roles'
      AND column_name = 'role_level'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE roles ADD COLUMN role_level INT NOT NULL DEFAULT 0 AFTER is_global'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO roles (code, name, is_global, role_level)
VALUES 
  ('SUPER_ADMIN', 'Super Admin', 1, 100),
  ('OWNER', 'Owner', 1, 90),
  ('COMPANY_ADMIN', 'Company Admin', 1, 80)
  ('ADMIN', 'Admin', 0, 60),
  ('ACCOUNTANT', 'Accountant', 0, 40),
  ('CASHIER', 'Cashier', 0, 20),
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_global = VALUES(is_global),
  role_level = VALUES(role_level),
  updated_at = CURRENT_TIMESTAMP;

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'users', 15
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'outlets', 15
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'accounts', 15
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'journals', 15
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'sales', 15
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'inventory', 15
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'reports', 2
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';

INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id, r.id, 'settings', 6
FROM companies c
INNER JOIN roles r ON r.code = 'COMPANY_ADMIN';
