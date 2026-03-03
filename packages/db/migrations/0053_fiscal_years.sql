-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create fiscal_years table

CREATE TABLE IF NOT EXISTS fiscal_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fiscal_years_company_code (company_id, code),
  KEY idx_fiscal_years_company_status (company_id, status),
  KEY idx_fiscal_years_company_start_date (company_id, start_date),
  CONSTRAINT chk_fiscal_years_date_range CHECK (start_date <= end_date),
  CONSTRAINT chk_fiscal_years_status CHECK (status IN ('OPEN', 'CLOSED')),
  CONSTRAINT fk_fiscal_years_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fiscal_years_created_by_user FOREIGN KEY (created_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fiscal_years_updated_by_user FOREIGN KEY (updated_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
