-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add nullable account_id to tax_rates for tax liability account mapping
-- This enables per-tax-rate liability account configuration instead of hardcoded SALES_TAX mapping
-- Uses dynamic DDL pattern for MySQL/MariaDB compatibility

-- ============================================================
-- Ensure parent index exists on accounts(company_id, id) for FK (idempotent)
-- Required by composite FK references
-- ============================================================
SET @parent_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'accounts'
    AND index_name = 'idx_accounts_company_id_id'
    AND seq_in_index = 1
    AND column_name = 'company_id'
);

SET @stmt = IF(
  @parent_index_exists = 0,
  'ALTER TABLE accounts ADD KEY idx_accounts_company_id_id (company_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add account_id column (idempotent)
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tax_rates'
    AND column_name = 'account_id'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE tax_rates ADD COLUMN account_id BIGINT UNSIGNED NULL AFTER rate_percent',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add composite index for (company_id, account_id) lookup (idempotent)
-- Required for composite FK and efficient tenant-scoped queries
-- ============================================================
SET @composite_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'tax_rates'
    AND index_name = 'idx_tax_rates_company_account'
    AND seq_in_index = 1
    AND column_name = 'company_id'
);

SET @stmt = IF(
  @composite_index_exists = 0,
  'ALTER TABLE tax_rates ADD KEY idx_tax_rates_company_account (company_id, account_id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add foreign key constraint (idempotent)
-- Note: FK requires indexed columns, which we added above
-- Using RESTRICT to avoid SET NULL issues with NOT NULL company_id
-- ============================================================
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'tax_rates'
    AND constraint_name = 'fk_tax_rates_account'
    AND constraint_type = 'FOREIGN KEY'
);

SET @stmt = IF(
  @fk_exists = 0,
  'ALTER TABLE tax_rates ADD CONSTRAINT fk_tax_rates_account FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
