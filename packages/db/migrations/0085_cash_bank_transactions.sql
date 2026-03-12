-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Create cash_bank_transactions table for Cash & Bank Operations
-- Implements ADR-0007 Part B and ADR-0008 decision on reference uniqueness

-- ============================================================
-- Ensure parent indexes exist for composite FK constraints
-- ============================================================
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

-- ============================================================
-- Create cash_bank_transactions table (tenant-scoped foreign keys)
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_bank_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  transaction_type ENUM('MUTATION', 'TOP_UP', 'WITHDRAWAL', 'FOREX') NOT NULL,
  transaction_date DATE NOT NULL,
  reference VARCHAR(100) NULL,
  description VARCHAR(500) NOT NULL,
  source_account_id BIGINT UNSIGNED NOT NULL,
  destination_account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  exchange_rate DECIMAL(18,8) NULL,
  base_amount DECIMAL(18,2) NULL,
  fx_gain_loss DECIMAL(18,2) NULL DEFAULT 0,
  fx_account_id BIGINT UNSIGNED NULL,
  status ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
  posted_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_bank_tx_company_reference (company_id, reference),
  KEY idx_cash_bank_tx_company_date (company_id, transaction_date),
  KEY idx_cash_bank_tx_company_type (company_id, transaction_type),
  KEY idx_cash_bank_tx_company_status (company_id, status),
  KEY idx_cash_bank_tx_company_outlet_date (company_id, outlet_id, transaction_date),
  KEY idx_cash_bank_tx_company_source (company_id, source_account_id),
  KEY idx_cash_bank_tx_company_dest (company_id, destination_account_id),
  KEY idx_cash_bank_tx_company_fx (company_id, fx_account_id),
  CONSTRAINT fk_cash_bank_tx_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_cash_bank_tx_outlet FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_cash_bank_tx_source_account FOREIGN KEY (company_id, source_account_id) REFERENCES accounts(company_id, id),
  CONSTRAINT fk_cash_bank_tx_dest_account FOREIGN KEY (company_id, destination_account_id) REFERENCES accounts(company_id, id),
  CONSTRAINT fk_cash_bank_tx_fx_account FOREIGN KEY (company_id, fx_account_id) REFERENCES accounts(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_cash_bank_tx_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_cash_bank_tx_source_dest_diff CHECK (source_account_id <> destination_account_id)
) ENGINE=InnoDB;

-- ============================================================
-- Add unique constraint on non-null reference (idempotent)
-- ============================================================
SET @unique_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'cash_bank_transactions'
    AND constraint_name = 'uq_cash_bank_tx_company_reference'
    AND constraint_type = 'UNIQUE'
);

SET @stmt = IF(
  @unique_exists = 0,
  'ALTER TABLE cash_bank_transactions ADD CONSTRAINT uq_cash_bank_tx_company_reference UNIQUE KEY (company_id, reference)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Sync version bump triggers
-- ============================================================
DROP TRIGGER IF EXISTS trg_cash_bank_transactions_ai_bump_sync_version;
CREATE TRIGGER trg_cash_bank_transactions_ai_bump_sync_version
AFTER INSERT ON cash_bank_transactions
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_cash_bank_transactions_au_bump_sync_version;
CREATE TRIGGER trg_cash_bank_transactions_au_bump_sync_version
AFTER UPDATE ON cash_bank_transactions
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_cash_bank_transactions_ad_bump_sync_version;
CREATE TRIGGER trg_cash_bank_transactions_ad_bump_sync_version
AFTER DELETE ON cash_bank_transactions
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;
