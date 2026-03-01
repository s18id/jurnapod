-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create company_settings table (outlet scoped)

CREATE TABLE IF NOT EXISTS company_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  value_type VARCHAR(16) NOT NULL,
  value_json LONGTEXT NOT NULL,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_settings_scope_key (company_id, outlet_id, `key`),
  KEY idx_company_settings_scope (company_id, outlet_id),
  CONSTRAINT chk_company_settings_value_json CHECK (JSON_VALID(value_json)),
  CONSTRAINT fk_company_settings_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_company_settings_outlet_scoped FOREIGN KEY (company_id, outlet_id)
    REFERENCES outlets(company_id, id),
  CONSTRAINT fk_company_settings_created_by_user FOREIGN KEY (created_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_company_settings_updated_by_user FOREIGN KEY (updated_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
