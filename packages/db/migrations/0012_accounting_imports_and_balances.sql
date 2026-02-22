ALTER TABLE accounts
  ADD COLUMN type_name VARCHAR(191) NULL AFTER name,
  ADD COLUMN normal_balance CHAR(1) NULL AFTER type_name,
  ADD COLUMN report_group VARCHAR(8) NULL AFTER normal_balance,
  ADD COLUMN parent_account_id BIGINT UNSIGNED NULL AFTER report_group,
  ADD COLUMN is_group TINYINT(1) NOT NULL DEFAULT 0 AFTER parent_account_id,
  ADD KEY idx_accounts_parent_account_id (parent_account_id),
  ADD CONSTRAINT fk_accounts_parent
    FOREIGN KEY (parent_account_id)
    REFERENCES accounts(id);

CREATE TABLE IF NOT EXISTS data_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  da_file_name VARCHAR(255) NOT NULL,
  trns_file_name VARCHAR(255) NOT NULL,
  alk_file_name VARCHAR(255) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  counts_json LONGTEXT NULL,
  error_json LONGTEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_data_imports_company_hash (company_id, file_hash),
  CONSTRAINT chk_data_imports_counts_json CHECK (counts_json IS NULL OR JSON_VALID(counts_json)),
  CONSTRAINT chk_data_imports_error_json CHECK (error_json IS NULL OR JSON_VALID(error_json)),
  CONSTRAINT fk_data_imports_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_data_imports_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_balances_current (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  as_of_date DATE NOT NULL,
  debit_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_account_balances_current_company_account (company_id, account_id),
  KEY idx_account_balances_current_company_as_of (company_id, as_of_date),
  CONSTRAINT fk_account_balances_current_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_account_balances_current_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;
