-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS fixed_asset_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  depreciation_method VARCHAR(32) NOT NULL DEFAULT 'STRAIGHT_LINE',
  useful_life_months INT UNSIGNED NOT NULL,
  residual_value_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fixed_asset_categories_company_code (company_id, code),
  KEY idx_fixed_asset_categories_company_active (company_id, is_active),
  KEY idx_fixed_asset_categories_company_updated (company_id, updated_at),
  CONSTRAINT chk_fixed_asset_categories_method CHECK (depreciation_method IN ('STRAIGHT_LINE')),
  CONSTRAINT chk_fixed_asset_categories_useful_life_positive CHECK (useful_life_months > 0),
  CONSTRAINT chk_fixed_asset_categories_residual_pct_range CHECK (residual_value_pct >= 0 AND residual_value_pct <= 100),
  CONSTRAINT fk_fixed_asset_categories_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

ALTER TABLE fixed_assets
  ADD COLUMN category_id BIGINT UNSIGNED DEFAULT NULL AFTER outlet_id,
  ADD KEY idx_fixed_assets_company_category (company_id, category_id),
  ADD CONSTRAINT fk_fixed_assets_category FOREIGN KEY (category_id) REFERENCES fixed_asset_categories(id) ON DELETE SET NULL;
