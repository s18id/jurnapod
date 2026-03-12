-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Hardening migration for already-applied cash_bank_transactions environments
-- Rerunnable on MySQL 8+ and MariaDB

SET @table_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
);

-- ============================================================
-- Drop legacy unscoped FKs if present
-- ============================================================
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_source_account'
);
SET @fk_has_company_col = (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_name = 'fk_cash_bank_tx_source_account'
    AND column_name = 'company_id'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 1 AND @fk_has_company_col = 0,
  'ALTER TABLE cash_bank_transactions DROP FOREIGN KEY fk_cash_bank_tx_source_account',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_dest_account'
);
SET @fk_has_company_col = (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_name = 'fk_cash_bank_tx_dest_account'
    AND column_name = 'company_id'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 1 AND @fk_has_company_col = 0,
  'ALTER TABLE cash_bank_transactions DROP FOREIGN KEY fk_cash_bank_tx_dest_account',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_fx_account'
);
SET @fk_has_company_col = (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_name = 'fk_cash_bank_tx_fx_account'
    AND column_name = 'company_id'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 1 AND @fk_has_company_col = 0,
  'ALTER TABLE cash_bank_transactions DROP FOREIGN KEY fk_cash_bank_tx_fx_account',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_outlet'
);
SET @fk_has_company_col = (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_name = 'fk_cash_bank_tx_outlet'
    AND column_name = 'company_id'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 1 AND @fk_has_company_col = 0,
  'ALTER TABLE cash_bank_transactions DROP FOREIGN KEY fk_cash_bank_tx_outlet',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add scoped FKs if missing
-- ============================================================
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_source_account'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE cash_bank_transactions ADD CONSTRAINT fk_cash_bank_tx_source_account FOREIGN KEY (company_id, source_account_id) REFERENCES accounts(company_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_dest_account'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE cash_bank_transactions ADD CONSTRAINT fk_cash_bank_tx_dest_account FOREIGN KEY (company_id, destination_account_id) REFERENCES accounts(company_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_fx_account'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE cash_bank_transactions ADD CONSTRAINT fk_cash_bank_tx_fx_account FOREIGN KEY (company_id, fx_account_id) REFERENCES accounts(company_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name = 'fk_cash_bank_tx_outlet'
);

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'accounts'
    AND index_name = 'idx_accounts_company_id_id'
    AND seq_in_index = 1
    AND column_name = 'company_id'
);
SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE accounts ADD KEY idx_accounts_company_id_id (company_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'outlets'
    AND index_name = 'idx_outlets_company_id_id'
    AND seq_in_index = 1
    AND column_name = 'company_id'
);
SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE outlets ADD KEY idx_outlets_company_id_id (company_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @legacy_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND index_name = 'fk_cash_bank_tx_outlet'
    AND seq_in_index = 1
    AND column_name = 'outlet_id'
);
SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 0 AND @legacy_idx_exists = 1,
  'ALTER TABLE cash_bank_transactions DROP INDEX fk_cash_bank_tx_outlet',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  @table_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE cash_bank_transactions ADD CONSTRAINT fk_cash_bank_tx_outlet FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Ensure required secondary indexes exist
-- ============================================================
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND index_name = 'idx_cash_bank_tx_company_date'
);
SET @stmt = IF(
  @table_exists = 1 AND @idx_exists = 0,
  'CREATE INDEX idx_cash_bank_tx_company_date ON cash_bank_transactions(company_id, transaction_date)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND index_name = 'idx_cash_bank_tx_company_type'
);
SET @stmt = IF(
  @table_exists = 1 AND @idx_exists = 0,
  'CREATE INDEX idx_cash_bank_tx_company_type ON cash_bank_transactions(company_id, transaction_type)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND index_name = 'idx_cash_bank_tx_company_status'
);
SET @stmt = IF(
  @table_exists = 1 AND @idx_exists = 0,
  'CREATE INDEX idx_cash_bank_tx_company_status ON cash_bank_transactions(company_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND index_name = 'idx_cash_bank_tx_company_outlet_date'
);
SET @stmt = IF(
  @table_exists = 1 AND @idx_exists = 0,
  'CREATE INDEX idx_cash_bank_tx_company_outlet_date ON cash_bank_transactions(company_id, outlet_id, transaction_date)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
