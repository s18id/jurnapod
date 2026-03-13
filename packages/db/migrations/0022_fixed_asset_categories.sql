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

SET @category_column_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_assets'
    AND COLUMN_NAME = 'category_id'
);

SET @category_key_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_assets'
    AND INDEX_NAME = 'idx_fixed_assets_company_category'
);

SET @category_fk_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_assets'
    AND CONSTRAINT_NAME = 'fk_fixed_assets_category'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @add_column_sql := IF(
  @category_column_exists = 0,
  'ALTER TABLE fixed_assets ADD COLUMN category_id BIGINT UNSIGNED DEFAULT NULL AFTER outlet_id',
  'SELECT ''Column already exists'''
);
PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

SET @add_key_sql := IF(
  @category_key_exists = 0,
  'ALTER TABLE fixed_assets ADD KEY idx_fixed_assets_company_category (company_id, category_id)',
  'SELECT ''Key already exists'''
);
PREPARE add_key_stmt FROM @add_key_sql;
EXECUTE add_key_stmt;
DEALLOCATE PREPARE add_key_stmt;

SET @add_fk_sql := IF(
  @category_fk_exists = 0,
  'ALTER TABLE fixed_assets ADD CONSTRAINT fk_fixed_assets_category FOREIGN KEY (category_id) REFERENCES fixed_asset_categories(id) ON DELETE SET NULL',
  'SELECT ''Foreign key already exists'''
);
PREPARE add_fk_stmt FROM @add_fk_sql;
EXECUTE add_fk_stmt;
DEALLOCATE PREPARE add_fk_stmt;
