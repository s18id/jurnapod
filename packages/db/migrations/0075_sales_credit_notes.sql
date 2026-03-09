-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Credit Notes: Refund workflow
-- Status flow: DRAFT -> POSTED
--               DRAFT -> VOID
--               POSTED -> VOID

CREATE TABLE IF NOT EXISTS sales_credit_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  credit_note_no VARCHAR(64) NOT NULL,
  credit_note_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  reason TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_credit_notes_company_credit_note_no (company_id, credit_note_no),
  KEY idx_sales_credit_notes_company_credit_note_date (company_id, credit_note_date),
  KEY idx_sales_credit_notes_outlet_credit_note_date (outlet_id, credit_note_date),
  KEY idx_sales_credit_notes_company_status (company_id, status),
  KEY idx_sales_credit_notes_scope_id (company_id, outlet_id, id),
  KEY idx_sales_credit_notes_invoice_id (invoice_id),
  CONSTRAINT chk_sales_credit_notes_status CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
  CONSTRAINT chk_sales_credit_notes_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT fk_sales_credit_notes_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_sales_credit_notes_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_sales_credit_notes_invoice_scoped FOREIGN KEY (company_id, outlet_id, invoice_id) REFERENCES sales_invoices(company_id, outlet_id, id),
  CONSTRAINT fk_sales_credit_notes_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_credit_notes_updated_by_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_credit_note_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  credit_note_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  unit_price DECIMAL(18,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_credit_note_lines_credit_note_line_no (credit_note_id, line_no),
  KEY idx_sales_credit_note_lines_company_created_at (company_id, created_at),
  KEY idx_sales_credit_note_lines_outlet_created_at (outlet_id, created_at),
  KEY idx_sales_credit_note_lines_scope_credit_note (company_id, outlet_id, credit_note_id),
  CONSTRAINT chk_sales_credit_note_lines_qty_positive CHECK (qty > 0),
  CONSTRAINT chk_sales_credit_note_lines_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT chk_sales_credit_note_lines_line_total_non_negative CHECK (line_total >= 0),
  CONSTRAINT fk_sales_credit_note_lines_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_sales_credit_note_lines_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_sales_credit_note_lines_credit_note_scoped FOREIGN KEY (company_id, outlet_id, credit_note_id) REFERENCES sales_credit_notes(company_id, outlet_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Add client_ref for idempotency (follows sales_payments pattern)
SET @client_ref_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_credit_notes'
    AND COLUMN_NAME = 'client_ref'
);

SET @add_client_ref_sql := IF(
  @client_ref_exists = 0,
  'ALTER TABLE sales_credit_notes ADD COLUMN client_ref CHAR(36) DEFAULT NULL AFTER amount',
  'SELECT 1'
);

PREPARE add_client_ref_stmt FROM @add_client_ref_sql;
EXECUTE add_client_ref_stmt;
DEALLOCATE PREPARE add_client_ref_stmt;

-- Add unique constraint for client_ref per company
SET @unique_client_ref_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_credit_notes'
    AND INDEX_NAME = 'uq_sales_credit_notes_company_client_ref'
);

SET @add_unique_client_ref_sql := IF(
  @unique_client_ref_exists = 0,
  'CREATE UNIQUE INDEX uq_sales_credit_notes_company_client_ref ON sales_credit_notes (company_id, client_ref)',
  'SELECT 1'
);

PREPARE add_unique_client_ref_stmt FROM @add_unique_client_ref_sql;
EXECUTE add_unique_client_ref_stmt;
DEALLOCATE PREPARE add_unique_client_ref_stmt;
