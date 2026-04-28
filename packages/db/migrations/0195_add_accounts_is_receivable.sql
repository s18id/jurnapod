-- Migration: 0195_add_accounts_is_receivable.sql
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Add is_receivable column to accounts table for AR reconciliation

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add is_receivable column if not exists
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'accounts'
    AND column_name = 'is_receivable'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE accounts ADD COLUMN `is_receivable` tinyint(1) NOT NULL DEFAULT 0 AFTER `is_payable`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for receivables lookup if not exists
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'accounts'
    AND index_name = 'idx_accounts_company_receivable_active'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE accounts ADD INDEX `idx_accounts_company_receivable_active` (`company_id`, `is_receivable`, `is_active`, `id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;