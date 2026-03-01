-- Scope module_roles by company (idempotent)
SET @has_company_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND COLUMN_NAME = 'company_id'
);
SET @sql := IF(@has_company_id = 0,
  'ALTER TABLE module_roles ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_company_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND CONSTRAINT_NAME = 'fk_module_roles_company'
);
SET @sql := IF(@has_company_fk = 0,
  'ALTER TABLE module_roles ADD CONSTRAINT fk_module_roles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_role_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'idx_module_roles_role_id'
);
SET @sql := IF(@has_role_idx = 0,
  'CREATE INDEX idx_module_roles_role_id ON module_roles(role_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_old_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'uq_module_roles_role_module'
);
SET @sql := IF(@has_old_unique = 1,
  'ALTER TABLE module_roles DROP INDEX uq_module_roles_role_module',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_new_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'uq_module_roles_company_role_module'
);
SET @sql := IF(@has_new_unique = 0,
  'ALTER TABLE module_roles ADD UNIQUE KEY uq_module_roles_company_role_module (company_id, role_id, module)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_company_module_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND INDEX_NAME = 'idx_module_roles_company_module'
);
SET @sql := IF(@has_company_module_idx = 0,
  'CREATE INDEX idx_module_roles_company_module ON module_roles(company_id, module)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: duplicate default ACLs per company using seed defaults
INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id AS company_id,
       r.id AS role_id,
       t.module,
       t.permission_mask
FROM companies c
CROSS JOIN (
  SELECT "SUPER_ADMIN" AS role_code, "companies" AS module, 15 AS permission_mask UNION ALL
  SELECT "SUPER_ADMIN", "users", 15 UNION ALL
  SELECT "SUPER_ADMIN", "roles", 15 UNION ALL
  SELECT "SUPER_ADMIN", "outlets", 15 UNION ALL
  SELECT "SUPER_ADMIN", "accounts", 15 UNION ALL
  SELECT "SUPER_ADMIN", "journals", 15 UNION ALL
  SELECT "SUPER_ADMIN", "sales", 15 UNION ALL
  SELECT "SUPER_ADMIN", "inventory", 15 UNION ALL
  SELECT "SUPER_ADMIN", "purchasing", 15 UNION ALL
  SELECT "SUPER_ADMIN", "reports", 15 UNION ALL
  SELECT "SUPER_ADMIN", "settings", 15 UNION ALL

  SELECT "OWNER", "companies", 15 UNION ALL
  SELECT "OWNER", "users", 15 UNION ALL
  SELECT "OWNER", "roles", 15 UNION ALL
  SELECT "OWNER", "outlets", 15 UNION ALL
  SELECT "OWNER", "accounts", 15 UNION ALL
  SELECT "OWNER", "journals", 15 UNION ALL
  SELECT "OWNER", "sales", 15 UNION ALL
  SELECT "OWNER", "inventory", 15 UNION ALL
  SELECT "OWNER", "purchasing", 15 UNION ALL
  SELECT "OWNER", "reports", 15 UNION ALL
  SELECT "OWNER", "settings", 15 UNION ALL

  SELECT "ADMIN", "companies", 2 UNION ALL
  SELECT "ADMIN", "users", 15 UNION ALL
  SELECT "ADMIN", "roles", 2 UNION ALL
  SELECT "ADMIN", "outlets", 15 UNION ALL
  SELECT "ADMIN", "accounts", 15 UNION ALL
  SELECT "ADMIN", "journals", 15 UNION ALL
  SELECT "ADMIN", "sales", 15 UNION ALL
  SELECT "ADMIN", "inventory", 15 UNION ALL
  SELECT "ADMIN", "purchasing", 15 UNION ALL
  SELECT "ADMIN", "reports", 2 UNION ALL
  SELECT "ADMIN", "settings", 6 UNION ALL

  SELECT "CASHIER", "companies", 0 UNION ALL
  SELECT "CASHIER", "users", 0 UNION ALL
  SELECT "CASHIER", "roles", 0 UNION ALL
  SELECT "CASHIER", "outlets", 2 UNION ALL
  SELECT "CASHIER", "accounts", 0 UNION ALL
  SELECT "CASHIER", "journals", 0 UNION ALL
  SELECT "CASHIER", "sales", 3 UNION ALL
  SELECT "CASHIER", "inventory", 2 UNION ALL
  SELECT "CASHIER", "purchasing", 0 UNION ALL
  SELECT "CASHIER", "reports", 2 UNION ALL
  SELECT "CASHIER", "settings", 0 UNION ALL

  SELECT "ACCOUNTANT", "companies", 0 UNION ALL
  SELECT "ACCOUNTANT", "users", 0 UNION ALL
  SELECT "ACCOUNTANT", "roles", 0 UNION ALL
  SELECT "ACCOUNTANT", "outlets", 2 UNION ALL
  SELECT "ACCOUNTANT", "accounts", 2 UNION ALL
  SELECT "ACCOUNTANT", "journals", 2 UNION ALL
  SELECT "ACCOUNTANT", "sales", 2 UNION ALL
  SELECT "ACCOUNTANT", "inventory", 0 UNION ALL
  SELECT "ACCOUNTANT", "purchasing", 2 UNION ALL
  SELECT "ACCOUNTANT", "reports", 2 UNION ALL
  SELECT "ACCOUNTANT", "settings", 0
) t
INNER JOIN roles r ON r.code = t.role_code
;

UPDATE module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
INNER JOIN (
  SELECT "SUPER_ADMIN" AS role_code, "companies" AS module, 15 AS permission_mask UNION ALL
  SELECT "SUPER_ADMIN", "users", 15 UNION ALL
  SELECT "SUPER_ADMIN", "roles", 15 UNION ALL
  SELECT "SUPER_ADMIN", "outlets", 15 UNION ALL
  SELECT "SUPER_ADMIN", "accounts", 15 UNION ALL
  SELECT "SUPER_ADMIN", "journals", 15 UNION ALL
  SELECT "SUPER_ADMIN", "sales", 15 UNION ALL
  SELECT "SUPER_ADMIN", "inventory", 15 UNION ALL
  SELECT "SUPER_ADMIN", "purchasing", 15 UNION ALL
  SELECT "SUPER_ADMIN", "reports", 15 UNION ALL
  SELECT "SUPER_ADMIN", "settings", 15 UNION ALL

  SELECT "OWNER", "companies", 15 UNION ALL
  SELECT "OWNER", "users", 15 UNION ALL
  SELECT "OWNER", "roles", 15 UNION ALL
  SELECT "OWNER", "outlets", 15 UNION ALL
  SELECT "OWNER", "accounts", 15 UNION ALL
  SELECT "OWNER", "journals", 15 UNION ALL
  SELECT "OWNER", "sales", 15 UNION ALL
  SELECT "OWNER", "inventory", 15 UNION ALL
  SELECT "OWNER", "purchasing", 15 UNION ALL
  SELECT "OWNER", "reports", 15 UNION ALL
  SELECT "OWNER", "settings", 15 UNION ALL

  SELECT "ADMIN", "companies", 2 UNION ALL
  SELECT "ADMIN", "users", 15 UNION ALL
  SELECT "ADMIN", "roles", 2 UNION ALL
  SELECT "ADMIN", "outlets", 15 UNION ALL
  SELECT "ADMIN", "accounts", 15 UNION ALL
  SELECT "ADMIN", "journals", 15 UNION ALL
  SELECT "ADMIN", "sales", 15 UNION ALL
  SELECT "ADMIN", "inventory", 15 UNION ALL
  SELECT "ADMIN", "purchasing", 15 UNION ALL
  SELECT "ADMIN", "reports", 2 UNION ALL
  SELECT "ADMIN", "settings", 6 UNION ALL

  SELECT "CASHIER", "companies", 0 UNION ALL
  SELECT "CASHIER", "users", 0 UNION ALL
  SELECT "CASHIER", "roles", 0 UNION ALL
  SELECT "CASHIER", "outlets", 2 UNION ALL
  SELECT "CASHIER", "accounts", 0 UNION ALL
  SELECT "CASHIER", "journals", 0 UNION ALL
  SELECT "CASHIER", "sales", 3 UNION ALL
  SELECT "CASHIER", "inventory", 2 UNION ALL
  SELECT "CASHIER", "purchasing", 0 UNION ALL
  SELECT "CASHIER", "reports", 2 UNION ALL
  SELECT "CASHIER", "settings", 0 UNION ALL

  SELECT "ACCOUNTANT", "companies", 0 UNION ALL
  SELECT "ACCOUNTANT", "users", 0 UNION ALL
  SELECT "ACCOUNTANT", "roles", 0 UNION ALL
  SELECT "ACCOUNTANT", "outlets", 2 UNION ALL
  SELECT "ACCOUNTANT", "accounts", 2 UNION ALL
  SELECT "ACCOUNTANT", "journals", 2 UNION ALL
  SELECT "ACCOUNTANT", "sales", 2 UNION ALL
  SELECT "ACCOUNTANT", "inventory", 0 UNION ALL
  SELECT "ACCOUNTANT", "purchasing", 2 UNION ALL
  SELECT "ACCOUNTANT", "reports", 2 UNION ALL
  SELECT "ACCOUNTANT", "settings", 0
) t ON t.role_code = r.code AND t.module = mr.module
SET mr.permission_mask = t.permission_mask,
    mr.updated_at = CURRENT_TIMESTAMP;

-- Remove legacy rows without company_id
DELETE FROM module_roles WHERE company_id IS NULL;
