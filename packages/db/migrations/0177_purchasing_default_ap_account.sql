-- Migration: 0177_purchasing_default_ap_account.sql
-- Story 46.5 Scope A: Add purchasing AP default account setting
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- purchasing_default_ap_account_id (references accounts.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'company_modules'
    AND column_name = 'purchasing_default_ap_account_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE company_modules ADD COLUMN purchasing_default_ap_account_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for purchasing_default_ap_account_id -> accounts(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'company_modules'
    AND constraint_name = 'fk_cm_purchasing_default_ap_account'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_purchasing_default_ap_account FOREIGN KEY (purchasing_default_ap_account_id) REFERENCES accounts(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
