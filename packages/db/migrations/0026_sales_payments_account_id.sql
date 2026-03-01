-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Add account_id to sales_payments
-- Replaces method enum with FK to accounts (cash/bank accounts only via is_payable)

-- Add account_id column (nullable initially for backfill)
SET @account_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'account_id'
);

SET @add_account_id_sql := IF(
  @account_id_exists = 0,
  'ALTER TABLE sales_payments\n'
  '  ADD COLUMN account_id BIGINT UNSIGNED DEFAULT NULL AFTER invoice_id,\n'
  '  ADD KEY idx_sales_payments_account (account_id),\n'
  '  ADD CONSTRAINT fk_sales_payments_account\n'
  '    FOREIGN KEY (account_id) REFERENCES accounts(id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_account_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill: map method strings to accounts
-- This assumes you have accounts named "Kas", "QRIS", "Bank Card" etc.
-- Adjust the mapping logic based on your actual account structure

-- Map CASH -> first Kas/Cash account marked as payable
UPDATE sales_payments sp
  JOIN (
    SELECT company_id, MIN(id) AS account_id
    FROM accounts
    WHERE is_payable = 1
      AND (name LIKE '%Kas%' OR name LIKE '%Cash%')
    GROUP BY company_id
  ) a ON a.company_id = sp.company_id
  SET sp.account_id = a.account_id
  WHERE sp.method = 'CASH'
    AND sp.account_id IS NULL;

-- Map QRIS -> first QRIS account marked as payable
UPDATE sales_payments sp
  JOIN (
    SELECT company_id, MIN(id) AS account_id
    FROM accounts
    WHERE is_payable = 1
      AND name LIKE '%QRIS%'
    GROUP BY company_id
  ) a ON a.company_id = sp.company_id
  SET sp.account_id = a.account_id
  WHERE sp.method = 'QRIS'
    AND sp.account_id IS NULL;

-- Map CARD -> first Bank/Card account marked as payable
UPDATE sales_payments sp
  JOIN (
    SELECT company_id, MIN(id) AS account_id
    FROM accounts
    WHERE is_payable = 1
      AND (name LIKE '%Bank%' OR name LIKE '%Card%' OR name LIKE '%Kartu%')
    GROUP BY company_id
  ) a ON a.company_id = sp.company_id
  SET sp.account_id = a.account_id
  WHERE sp.method = 'CARD'
    AND sp.account_id IS NULL;

-- Make account_id NOT NULL after backfill (drop/re-add FK if needed)
SET @account_id_nullable := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'account_id'
    AND IS_NULLABLE = 'YES'
);

SET @sales_payments_account_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND constraint_name = 'fk_sales_payments_account'
);

SET @drop_sales_payments_account_fk_sql := IF(
  @account_id_nullable = 1 AND @sales_payments_account_fk_exists > 0,
  'ALTER TABLE sales_payments DROP FOREIGN KEY fk_sales_payments_account',
  'SELECT 1'
);

PREPARE stmt FROM @drop_sales_payments_account_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @make_account_id_not_null_sql := IF(
  @account_id_nullable = 1,
  'ALTER TABLE sales_payments MODIFY COLUMN account_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @make_account_id_not_null_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sales_payments_account_fk_exists_after := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND constraint_name = 'fk_sales_payments_account'
);

SET @add_sales_payments_account_fk_sql := IF(
  @sales_payments_account_fk_exists_after = 0,
  'ALTER TABLE sales_payments ADD CONSTRAINT fk_sales_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_sales_payments_account_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Optional: keep method column for backward compatibility during transition
-- or drop it if fully migrated:
-- ALTER TABLE sales_payments DROP COLUMN method;
