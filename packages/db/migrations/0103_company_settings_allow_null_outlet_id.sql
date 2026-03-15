-- 0103_company_settings_allow_null_outlet_id.sql
-- Allow NULL outlet_id in company_settings for company-level settings
-- Portable across MySQL 8.0+ and MariaDB

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_settings'
    AND COLUMN_NAME = 'outlet_id'
    AND IS_NULLABLE = 'YES'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE company_settings MODIFY COLUMN outlet_id BIGINT UNSIGNED NULL',
  'SELECT ''skip modify outlet_id'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @old_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_settings'
    AND INDEX_NAME = 'uq_company_settings_scope_key'
    AND NON_UNIQUE = 0
);

SET @stmt3 = IF(
  @old_idx_exists > 0,
  'ALTER TABLE company_settings DROP INDEX uq_company_settings_scope_key',
  'SELECT ''skip drop old index'''
);
PREPARE stmt3 FROM @stmt3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET @new_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_settings'
    AND INDEX_NAME = 'uq_company_settings_company_key'
    AND NON_UNIQUE = 0
);

SET @stmt4 = IF(
  @new_idx_exists = 0,
  'ALTER TABLE company_settings ADD UNIQUE INDEX uq_company_settings_company_key (company_id, outlet_id, `key`)',
  'SELECT ''skip add new index'''
);
PREPARE stmt4 FROM @stmt4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;
