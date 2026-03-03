-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Drop legacy unique index and backfill module_roles defaults (idempotent)

SET @has_old_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'uq_module_roles_role_module'
);
SET @sql := IF(@has_old_unique > 0,
  'ALTER TABLE module_roles DROP INDEX uq_module_roles_role_module',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_permission_mask := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND COLUMN_NAME = 'permission_mask'
);
SET @has_company_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND COLUMN_NAME = 'company_id'
);
SET @has_roles := (SELECT COUNT(*) FROM roles);
SET @has_companies := (SELECT COUNT(*) FROM companies);

SET @sql := IF(@has_permission_mask > 0 AND @has_company_id > 0 AND @has_roles > 0 AND @has_companies > 0,
  'INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)\n'
  'SELECT c.id AS company_id,\n'
  '       r.id AS role_id,\n'
  '       t.module,\n'
  '       t.permission_mask\n'
  'FROM companies c\n'
  'CROSS JOIN (\n'
  '  SELECT "SUPER_ADMIN" AS role_code, "companies" AS module, 15 AS permission_mask UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "users", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "roles", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "outlets", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "accounts", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "journals", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "sales", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "inventory", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "purchasing", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "reports", 15 UNION ALL\n'
  '  SELECT "SUPER_ADMIN", "settings", 15 UNION ALL\n'
  '\n'
  '  SELECT "OWNER", "companies", 15 UNION ALL\n'
  '  SELECT "OWNER", "users", 15 UNION ALL\n'
  '  SELECT "OWNER", "roles", 15 UNION ALL\n'
  '  SELECT "OWNER", "outlets", 15 UNION ALL\n'
  '  SELECT "OWNER", "accounts", 15 UNION ALL\n'
  '  SELECT "OWNER", "journals", 15 UNION ALL\n'
  '  SELECT "OWNER", "sales", 15 UNION ALL\n'
  '  SELECT "OWNER", "inventory", 15 UNION ALL\n'
  '  SELECT "OWNER", "purchasing", 15 UNION ALL\n'
  '  SELECT "OWNER", "reports", 15 UNION ALL\n'
  '  SELECT "OWNER", "settings", 15 UNION ALL\n'
  '\n'
  '  SELECT "ADMIN", "companies", 2 UNION ALL\n'
  '  SELECT "ADMIN", "users", 15 UNION ALL\n'
  '  SELECT "ADMIN", "roles", 2 UNION ALL\n'
  '  SELECT "ADMIN", "outlets", 15 UNION ALL\n'
  '  SELECT "ADMIN", "accounts", 15 UNION ALL\n'
  '  SELECT "ADMIN", "journals", 15 UNION ALL\n'
  '  SELECT "ADMIN", "sales", 15 UNION ALL\n'
  '  SELECT "ADMIN", "inventory", 15 UNION ALL\n'
  '  SELECT "ADMIN", "purchasing", 15 UNION ALL\n'
  '  SELECT "ADMIN", "reports", 2 UNION ALL\n'
  '  SELECT "ADMIN", "settings", 6 UNION ALL\n'
  '\n'
  '  SELECT "CASHIER", "companies", 0 UNION ALL\n'
  '  SELECT "CASHIER", "users", 0 UNION ALL\n'
  '  SELECT "CASHIER", "roles", 0 UNION ALL\n'
  '  SELECT "CASHIER", "outlets", 2 UNION ALL\n'
  '  SELECT "CASHIER", "accounts", 0 UNION ALL\n'
  '  SELECT "CASHIER", "journals", 0 UNION ALL\n'
  '  SELECT "CASHIER", "sales", 3 UNION ALL\n'
  '  SELECT "CASHIER", "inventory", 2 UNION ALL\n'
  '  SELECT "CASHIER", "purchasing", 0 UNION ALL\n'
  '  SELECT "CASHIER", "reports", 2 UNION ALL\n'
  '  SELECT "CASHIER", "settings", 0 UNION ALL\n'
  '\n'
  '  SELECT "ACCOUNTANT", "companies", 0 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "users", 0 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "roles", 0 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "outlets", 2 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "accounts", 2 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "journals", 2 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "sales", 2 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "inventory", 0 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "purchasing", 2 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "reports", 2 UNION ALL\n'
  '  SELECT "ACCOUNTANT", "settings", 0\n'
  ') t\n'
  'INNER JOIN roles r ON r.code = t.role_code',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
