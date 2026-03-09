-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Phase 8: Payment Enhancements - Multi-Payment Support
-- Adds sales_payment_splits table for split payment allocations
-- Each payment can have 1-10 splits across different accounts

-- ============================================================
-- Create sales_payment_splits table
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_payment_splits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  split_index INT UNSIGNED NOT NULL DEFAULT 0,
  account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_payment_splits_payment_index (payment_id, split_index),
  KEY idx_sales_payment_splits_company_payment (company_id, payment_id),
  KEY idx_sales_payment_splits_outlet_payment (outlet_id, payment_id),
  KEY idx_sales_payment_splits_account (account_id),
  KEY idx_sales_payment_splits_scope_payment (company_id, outlet_id, payment_id),
  CONSTRAINT chk_sales_payment_splits_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_sales_payment_splits_split_index_range CHECK (split_index BETWEEN 0 AND 9),
  CONSTRAINT fk_sales_payment_splits_payment_scoped FOREIGN KEY (company_id, outlet_id, payment_id) REFERENCES sales_payments(company_id, outlet_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_payment_splits_account_scoped FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- Add index on accounts table for scoped FK (if not exists)
-- ============================================================
SET @accounts_company_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND INDEX_NAME = 'idx_accounts_company_id_id'
);

SET @add_accounts_company_idx_sql := IF(
  @accounts_company_id_idx_exists = 0,
  'ALTER TABLE accounts ADD KEY idx_accounts_company_id_id (company_id, id)',
  'SELECT 1'
);

PREPARE add_accounts_company_idx_stmt FROM @add_accounts_company_idx_sql;
EXECUTE add_accounts_company_idx_stmt;
DEALLOCATE PREPARE add_accounts_company_idx_stmt;
