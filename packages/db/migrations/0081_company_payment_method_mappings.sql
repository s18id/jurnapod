-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Company-wide default payment method mappings
-- These provide fallback values when outlet-specific mappings are not set

-- ============================================================
-- Create company_payment_method_mappings table
-- ============================================================
CREATE TABLE IF NOT EXISTS company_payment_method_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  method_code VARCHAR(64) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(191) NULL,
  is_invoice_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_payment_method_code (company_id, method_code),
  KEY idx_company_payment_method_account (company_id, account_id),
  KEY idx_company_payment_method_invoice_default (company_id, is_invoice_default),
  CONSTRAINT fk_company_payment_method_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_company_payment_method_account FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id, id)
) ENGINE=InnoDB;
