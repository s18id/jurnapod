-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Company-wide default account mappings
-- These provide fallback values when outlet-specific mappings are not set

-- ============================================================
-- Create company_account_mappings table
-- ============================================================
CREATE TABLE IF NOT EXISTS company_account_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  mapping_key VARCHAR(64) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_account_mappings_key (company_id, mapping_key),
  KEY idx_company_account_mappings_account (company_id, account_id),
  CONSTRAINT chk_company_account_mappings_key CHECK (mapping_key IN ('AR', 'SALES_REVENUE', 'SALES_TAX', 'SALES_RETURNS')),
  CONSTRAINT fk_company_account_mappings_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_company_account_mappings_account FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id, id)
) ENGINE=InnoDB;
