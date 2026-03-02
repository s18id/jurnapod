-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Enforce company-scoped module_roles (idempotent)

-- Drop FK before changing column definition
SET @has_company_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND CONSTRAINT_NAME = 'fk_module_roles_company'
);
SET @sql := IF(@has_company_fk > 0,
  'ALTER TABLE module_roles DROP FOREIGN KEY fk_module_roles_company',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill NULL company_id
SET @company_count := (SELECT COUNT(*) FROM companies);
SET @null_count := (SELECT COUNT(*) FROM module_roles WHERE company_id IS NULL);
SET @non_null_count := (SELECT COUNT(*) FROM module_roles WHERE company_id IS NOT NULL);

-- If no company_id set at all, expand defaults to all companies
SET @sql := IF(@non_null_count = 0 AND @null_count > 0 AND @company_count > 0,
  'INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)\n'
  'SELECT c.id, mr.role_id, mr.module, mr.permission_mask\n'
  'FROM companies c\n'
  'CROSS JOIN (\n'
  '  SELECT DISTINCT role_id, module, permission_mask\n'
  '  FROM module_roles\n'
  '  WHERE company_id IS NULL\n'
  ') mr',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- For mixed data, backfill NULLs to earliest company by created_at
SET @first_company_id := (
  SELECT id
  FROM companies
  ORDER BY created_at ASC, id ASC
  LIMIT 1
);
SET @null_count := (SELECT COUNT(*) FROM module_roles WHERE company_id IS NULL);
SET @non_null_count := (SELECT COUNT(*) FROM module_roles WHERE company_id IS NOT NULL);
SET @sql := IF(@null_count > 0 AND @non_null_count > 0 AND @first_company_id IS NOT NULL,
  CONCAT('UPDATE module_roles SET company_id = ', @first_company_id, ' WHERE company_id IS NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Remove any remaining NULL rows when companies exist
SET @null_count := (SELECT COUNT(*) FROM module_roles WHERE company_id IS NULL);
SET @sql := IF(@company_count > 0 AND @null_count > 0,
  'DELETE FROM module_roles WHERE company_id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Enforce NOT NULL only when safe
SET @is_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND COLUMN_NAME = 'company_id'
    AND IS_NULLABLE = 'YES'
);
SET @null_count := (SELECT COUNT(*) FROM module_roles WHERE company_id IS NULL);
SET @sql := IF(@is_nullable > 0 AND @null_count = 0,
  'ALTER TABLE module_roles MODIFY company_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Re-add FK if missing
SET @has_company_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_roles'
    AND CONSTRAINT_NAME = 'fk_module_roles_company'
);
SET @sql := IF(@has_company_fk = 0,
  'ALTER TABLE module_roles ADD CONSTRAINT fk_module_roles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
