CREATE TABLE companies (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE outlets (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_outlets_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

CREATE TABLE pos_transactions (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  outlet_id CHAR(36) NOT NULL,
  client_tx_id CHAR(36) NOT NULL,
  status ENUM('COMPLETED','VOID','REFUND') NOT NULL,
  trx_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pos_client_tx_id UNIQUE (client_tx_id),
  CONSTRAINT fk_pos_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;

CREATE TABLE journal_batches (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  outlet_id CHAR(36),
  doc_type VARCHAR(64) NOT NULL,
  doc_id CHAR(36) NOT NULL,
  posted_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_journal_batches_company_posted_at (company_id, posted_at),
  INDEX idx_journal_batches_outlet_posted_at (outlet_id, posted_at),
  CONSTRAINT fk_journal_batch_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_journal_batch_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;

CREATE TABLE accounts (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accounts_company_code (company_id, code),
  CONSTRAINT fk_accounts_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

CREATE TABLE journal_lines (
  id CHAR(36) PRIMARY KEY,
  journal_batch_id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  outlet_id CHAR(36),
  account_id CHAR(36) NOT NULL,
  line_date DATE NOT NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_journal_lines_company_date (company_id, line_date),
  INDEX idx_journal_lines_account_date (account_id, line_date),
  INDEX idx_journal_lines_outlet_date (outlet_id, line_date),
  CONSTRAINT fk_journal_lines_batch FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id),
  CONSTRAINT fk_journal_lines_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_journal_lines_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_journal_lines_account FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;
