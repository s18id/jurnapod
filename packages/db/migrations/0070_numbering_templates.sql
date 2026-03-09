-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Numbering templates for automatic document number generation
-- Supports company-level and outlet-level numbering with configurable patterns

CREATE TABLE IF NOT EXISTS numbering_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  doc_type VARCHAR(32) NOT NULL,
  pattern VARCHAR(128) NOT NULL,
  reset_period VARCHAR(16) NOT NULL DEFAULT 'NEVER',
  current_value INT UNSIGNED NOT NULL DEFAULT 0,
  last_reset DATE DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_numbering_templates_company_outlet_doc (company_id, outlet_id, doc_type),
  KEY idx_numbering_templates_company_active (company_id, is_active),
  KEY idx_numbering_templates_outlet_active (outlet_id, is_active),
  CONSTRAINT chk_numbering_templates_reset_period CHECK (reset_period IN ('NEVER', 'YEARLY', 'MONTHLY')),
  CONSTRAINT chk_numbering_templates_current_value CHECK (current_value >= 0),
  CONSTRAINT fk_numbering_templates_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_numbering_templates_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Insert default numbering templates for existing companies (will be run by application on startup)
-- This table is populated by the application, not directly here
-- Default patterns:
-- SALES_INVOICE: INV/{{yy}}{{mm}}/{{seq4}}
-- SALES_PAYMENT: PAY/{{yy}}{{mm}}/{{seq4}}
-- SALES_ORDER: SO/{{yy}}{{mm}}/{{seq4}}
-- CREDIT_NOTE: CN/{{yy}}{{mm}}/{{seq4}}
