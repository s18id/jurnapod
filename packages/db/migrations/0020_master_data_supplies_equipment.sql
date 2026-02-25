CREATE TABLE IF NOT EXISTS supplies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(64) DEFAULT NULL,
  name VARCHAR(191) NOT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT 'unit',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplies_company_sku (company_id, sku),
  KEY idx_supplies_company_active (company_id, is_active),
  KEY idx_supplies_company_updated (company_id, updated_at),
  CONSTRAINT fk_supplies_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fixed_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  asset_tag VARCHAR(64) DEFAULT NULL,
  name VARCHAR(191) NOT NULL,
  serial_number VARCHAR(128) DEFAULT NULL,
  purchase_date DATE DEFAULT NULL,
  purchase_cost DECIMAL(18,2) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fixed_assets_company_asset_tag (company_id, asset_tag),
  KEY idx_fixed_assets_company_outlet (company_id, outlet_id),
  KEY idx_fixed_assets_company_active (company_id, is_active),
  KEY idx_fixed_assets_company_updated (company_id, updated_at),
  CONSTRAINT chk_fixed_assets_purchase_cost_non_negative CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  CONSTRAINT fk_fixed_assets_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fixed_assets_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;
