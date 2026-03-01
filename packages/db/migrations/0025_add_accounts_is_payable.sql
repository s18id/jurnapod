-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Add is_payable flag to accounts

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'accounts'
      AND column_name = 'is_payable'
  ),
  'SELECT 1',
  'ALTER TABLE accounts ADD COLUMN is_payable TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'accounts'
      AND index_name = 'idx_accounts_payable'
  ),
  'SELECT 1',
  'CREATE INDEX idx_accounts_payable ON accounts (company_id, is_payable)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE accounts
SET is_payable = 1
WHERE LOWER(name) IN ('kas', 'cash')
   OR LOWER(name) LIKE 'bank%';
