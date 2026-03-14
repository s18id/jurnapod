-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Fixed Asset Lifecycle: Book Value Table
-- Tracks running book values per asset (cost basis, accumulated depreciation, impairment, carrying amount)

SET @table_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_books'
);

SET @create_table_sql := IF(
  @table_exists = 0,
  'CREATE TABLE fixed_asset_books (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    asset_id BIGINT UNSIGNED NOT NULL,
    cost_basis DECIMAL(18,2) NOT NULL DEFAULT 0,
    accum_depreciation DECIMAL(18,2) NOT NULL DEFAULT 0,
    accum_impairment DECIMAL(18,2) NOT NULL DEFAULT 0,
    carrying_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    as_of_date DATE NOT NULL,
    last_event_id BIGINT UNSIGNED NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fixed_asset_books_asset (asset_id),
    CONSTRAINT fk_fixed_asset_books_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_fixed_asset_books_asset FOREIGN KEY (asset_id) REFERENCES fixed_assets(id),
    CONSTRAINT chk_fixed_asset_books_non_negative CHECK (cost_basis >= 0 AND accum_depreciation >= 0 AND accum_impairment >= 0 AND carrying_amount >= 0)
  ) ENGINE=InnoDB',
  'SELECT ''Table already exists'''
);

PREPARE create_table_stmt FROM @create_table_sql;
EXECUTE create_table_stmt;
DEALLOCATE PREPARE create_table_stmt;

SET @index_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_books'
    AND INDEX_NAME = 'idx_fixed_asset_books_company'
);

SET @add_index_sql := IF(
  @index_exists = 0,
  'CREATE INDEX idx_fixed_asset_books_company ON fixed_asset_books(company_id)',
  'SELECT ''Index already exists'''
);

PREPARE add_index_stmt FROM @add_index_sql;
EXECUTE add_index_stmt;
DEALLOCATE PREPARE add_index_stmt;
