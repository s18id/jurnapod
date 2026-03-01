-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create account_types table
-- Description: Normalize account type information by creating a separate lookup table
--              for account types with their associated normal balance and report group

-- Create account_types table
CREATE TABLE IF NOT EXISTS account_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(191) NOT NULL COMMENT 'Account type name (e.g., Kas, Bank, Pendapatan)',
  normal_balance CHAR(1) NULL COMMENT 'D=Debit, K=Kredit',
  report_group VARCHAR(8) NULL COMMENT 'NRC=Neraca, LR=Laba Rugi',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_account_types_company_name (company_id, name),
  KEY idx_account_types_company_active (company_id, is_active),
  
  CONSTRAINT fk_account_types_company FOREIGN KEY (company_id) 
    REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Account type definitions with normal balance and report group';

-- Add account_type_id column to accounts table
SET @account_type_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND COLUMN_NAME = 'account_type_id'
);

SET @add_account_type_column_sql := IF(
  @account_type_column_exists = 0,
  'ALTER TABLE accounts ADD COLUMN account_type_id BIGINT UNSIGNED NULL AFTER name',
  'SELECT 1'
);

PREPARE stmt FROM @add_account_type_column_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @account_type_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND INDEX_NAME = 'idx_accounts_type'
);

SET @add_account_type_index_sql := IF(
  @account_type_index_exists = 0,
  'ALTER TABLE accounts ADD KEY idx_accounts_type (account_type_id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_account_type_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @account_type_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND CONSTRAINT_NAME = 'fk_accounts_account_type'
);

SET @add_account_type_fk_sql := IF(
  @account_type_fk_exists = 0,
  'ALTER TABLE accounts ADD CONSTRAINT fk_accounts_account_type FOREIGN KEY (account_type_id) REFERENCES account_types(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_account_type_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migrate existing data: Create account types from distinct type_name values
INSERT INTO account_types (company_id, name, normal_balance, report_group, is_active)
SELECT DISTINCT 
  company_id,
  type_name as name,
  normal_balance,
  report_group,
  1 as is_active
FROM accounts
WHERE type_name IS NOT NULL
  AND type_name != ''
ON DUPLICATE KEY UPDATE
  normal_balance = VALUES(normal_balance),
  report_group = VALUES(report_group),
  updated_at = CURRENT_TIMESTAMP;

-- Update accounts to reference account_types
UPDATE accounts a
INNER JOIN account_types at ON a.company_id = at.company_id 
  AND CONVERT(a.type_name USING utf8mb4) COLLATE utf8mb4_unicode_ci = at.name
SET a.account_type_id = at.id
WHERE a.type_name IS NOT NULL AND a.type_name != '';

-- Note: We keep the old columns for backward compatibility during transition
-- They can be removed in a future migration after all code is updated:
-- ALTER TABLE accounts DROP COLUMN type_name;
-- ALTER TABLE accounts DROP COLUMN normal_balance;
-- ALTER TABLE accounts DROP COLUMN report_group;
