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
VALUES ('COMPANY_ADMIN', 'Company Admin', 1, 80)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_global = VALUES(is_global),
  role_level = VALUES(role_level),
  updated_at = CURRENT_TIMESTAMP;

UPDATE roles SET is_global = 1, role_level = 100 WHERE code = 'SUPER_ADMIN';
UPDATE roles SET is_global = 1, role_level = 90 WHERE code = 'OWNER';
UPDATE roles SET is_global = 0, role_level = 60 WHERE code = 'ADMIN';
UPDATE roles SET is_global = 0, role_level = 40 WHERE code = 'ACCOUNTANT';
UPDATE roles SET is_global = 0, role_level = 20 WHERE code = 'CASHIER';

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
