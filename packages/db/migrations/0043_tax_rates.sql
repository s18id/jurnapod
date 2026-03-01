-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Multi-tax support (tax rates + defaults + transaction tax lines)

CREATE TABLE IF NOT EXISTS tax_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  rate_percent DECIMAL(9,4) NOT NULL DEFAULT 0,
  is_inclusive TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tax_rates_company_code (company_id, code),
  KEY idx_tax_rates_company_active (company_id, is_active),
  CONSTRAINT chk_tax_rates_rate_percent CHECK (rate_percent >= 0 AND rate_percent <= 100),
  CONSTRAINT fk_tax_rates_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_tax_rates_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tax_rates_updated_by_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS company_tax_defaults (
  company_id BIGINT UNSIGNED NOT NULL,
  tax_rate_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, tax_rate_id),
  KEY idx_company_tax_defaults_tax_rate (tax_rate_id),
  CONSTRAINT fk_company_tax_defaults_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_company_tax_defaults_tax_rate FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_tax_defaults_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_company_tax_defaults_updated_by_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_transaction_taxes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pos_transaction_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  tax_rate_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_transaction_taxes_tx_rate (pos_transaction_id, tax_rate_id),
  KEY idx_pos_transaction_taxes_company_outlet (company_id, outlet_id),
  KEY idx_pos_transaction_taxes_tax_rate (tax_rate_id),
  CONSTRAINT chk_pos_transaction_taxes_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT fk_pos_transaction_taxes_tx FOREIGN KEY (pos_transaction_id) REFERENCES pos_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_transaction_taxes_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_transaction_taxes_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_pos_transaction_taxes_tax_rate FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_invoice_taxes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sales_invoice_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  tax_rate_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_invoice_taxes_invoice_rate (sales_invoice_id, tax_rate_id),
  KEY idx_sales_invoice_taxes_company_outlet (company_id, outlet_id),
  KEY idx_sales_invoice_taxes_tax_rate (tax_rate_id),
  CONSTRAINT chk_sales_invoice_taxes_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT fk_sales_invoice_taxes_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_invoice_taxes_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_sales_invoice_taxes_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_sales_invoice_taxes_tax_rate FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Backfill: migrate existing pos tax config into a default tax rate
INSERT INTO tax_rates (company_id, code, name, rate_percent, is_inclusive, is_active)
SELECT
  c.id AS company_id,
  'DEFAULT' AS code,
  'Default Tax' AS name,
  CAST(
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(cfg.config_json, '$.tax.rate')),
      JSON_UNQUOTE(JSON_EXTRACT(tax.config_json, '$.rate')),
      '0'
    ) AS DECIMAL(9,4)
  ) AS rate_percent,
  CASE
    WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(cfg.config_json, '$.tax.inclusive'))) = 'true' THEN 1
    WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(tax.config_json, '$.inclusive'))) = 'true' THEN 1
    ELSE 0
  END AS is_inclusive,
  1 AS is_active
FROM companies c
LEFT JOIN feature_flags cfg
  ON cfg.company_id = c.id
  AND cfg.`key` = 'pos.config'
  AND cfg.enabled = 1
LEFT JOIN feature_flags tax
  ON tax.company_id = c.id
  AND tax.`key` = 'pos.tax'
  AND tax.enabled = 1
WHERE cfg.id IS NOT NULL OR tax.id IS NOT NULL
ON DUPLICATE KEY UPDATE
  rate_percent = VALUES(rate_percent),
  is_inclusive = VALUES(is_inclusive),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

INSERT IGNORE INTO company_tax_defaults (company_id, tax_rate_id)
SELECT company_id, id
FROM tax_rates
WHERE code = 'DEFAULT';

DROP TRIGGER IF EXISTS trg_tax_rates_ai_bump_sync_version;
CREATE TRIGGER trg_tax_rates_ai_bump_sync_version
AFTER INSERT ON tax_rates
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_tax_rates_au_bump_sync_version;
CREATE TRIGGER trg_tax_rates_au_bump_sync_version
AFTER UPDATE ON tax_rates
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_tax_rates_ad_bump_sync_version;
CREATE TRIGGER trg_tax_rates_ad_bump_sync_version
AFTER DELETE ON tax_rates
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_company_tax_defaults_ai_bump_sync_version;
CREATE TRIGGER trg_company_tax_defaults_ai_bump_sync_version
AFTER INSERT ON company_tax_defaults
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_company_tax_defaults_au_bump_sync_version;
CREATE TRIGGER trg_company_tax_defaults_au_bump_sync_version
AFTER UPDATE ON company_tax_defaults
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_company_tax_defaults_ad_bump_sync_version;
CREATE TRIGGER trg_company_tax_defaults_ad_bump_sync_version
AFTER DELETE ON company_tax_defaults
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;
