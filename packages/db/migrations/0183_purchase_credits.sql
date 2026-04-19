-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0183_purchase_credits.sql
-- Story 46.7: Supplier Credit Notes schema
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS purchase_credits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  supplier_id INT NOT NULL,
  credit_no VARCHAR(64) NOT NULL,
  credit_date DATE NOT NULL,
  description VARCHAR(1000) DEFAULT NULL,
  status TINYINT UNSIGNED NOT NULL DEFAULT 10,
  total_credit_amount DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  applied_amount DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  journal_batch_id BIGINT UNSIGNED DEFAULT NULL,
  posted_at DATETIME DEFAULT NULL,
  posted_by_user_id INT UNSIGNED DEFAULT NULL,
  voided_at DATETIME DEFAULT NULL,
  voided_by_user_id INT UNSIGNED DEFAULT NULL,
  created_by_user_id INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_purchase_credits_company_credit_no (company_id, credit_no),
  INDEX idx_purchase_credits_company (company_id),
  INDEX idx_purchase_credits_supplier (supplier_id),
  INDEX idx_purchase_credits_status (status),
  INDEX idx_purchase_credits_credit_date (credit_date),

  CONSTRAINT fk_purchase_credits_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credits_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credits_journal_batch FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_credit_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_credit_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  purchase_invoice_id BIGINT UNSIGNED DEFAULT NULL,
  purchase_invoice_line_id BIGINT UNSIGNED DEFAULT NULL,
  item_id BIGINT UNSIGNED DEFAULT NULL,
  description VARCHAR(1000) DEFAULT NULL,
  qty DECIMAL(19,4) NOT NULL,
  unit_price DECIMAL(19,4) NOT NULL,
  line_amount DECIMAL(19,4) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_purchase_credit_lines_credit_line (purchase_credit_id, line_no),
  INDEX idx_purchase_credit_lines_credit (purchase_credit_id),
  INDEX idx_purchase_credit_lines_invoice (purchase_invoice_id),

  CONSTRAINT fk_purchase_credit_lines_credit FOREIGN KEY (purchase_credit_id) REFERENCES purchase_credits(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credit_lines_invoice FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credit_lines_invoice_line FOREIGN KEY (purchase_invoice_line_id) REFERENCES purchase_invoice_lines(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_credit_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  purchase_credit_id BIGINT UNSIGNED NOT NULL,
  purchase_credit_line_id BIGINT UNSIGNED NOT NULL,
  purchase_invoice_id BIGINT UNSIGNED NOT NULL,
  applied_amount DECIMAL(19,4) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_purchase_credit_applications_credit (purchase_credit_id),
  INDEX idx_purchase_credit_applications_invoice (purchase_invoice_id),

  CONSTRAINT fk_purchase_credit_applications_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credit_applications_credit FOREIGN KEY (purchase_credit_id) REFERENCES purchase_credits(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credit_applications_line FOREIGN KEY (purchase_credit_line_id) REFERENCES purchase_credit_lines(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_purchase_credit_applications_invoice FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
