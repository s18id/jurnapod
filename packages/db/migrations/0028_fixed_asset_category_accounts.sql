-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add depreciation account mappings to fixed asset categories

SET @expense_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_categories'
    AND COLUMN_NAME = 'expense_account_id'
);

SET @add_expense_column_sql := IF(
  @expense_column_exists = 0,
  'ALTER TABLE fixed_asset_categories ADD COLUMN expense_account_id BIGINT UNSIGNED DEFAULT NULL AFTER residual_value_pct',
  'SELECT 1'
);

PREPARE add_expense_column_stmt FROM @add_expense_column_sql;
EXECUTE add_expense_column_stmt;
DEALLOCATE PREPARE add_expense_column_stmt;

SET @accum_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_categories'
    AND COLUMN_NAME = 'accum_depr_account_id'
);

SET @add_accum_column_sql := IF(
  @accum_column_exists = 0,
  'ALTER TABLE fixed_asset_categories ADD COLUMN accum_depr_account_id BIGINT UNSIGNED DEFAULT NULL AFTER expense_account_id',
  'SELECT 1'
);

PREPARE add_accum_column_stmt FROM @add_accum_column_sql;
EXECUTE add_accum_column_stmt;
DEALLOCATE PREPARE add_accum_column_stmt;

SET @expense_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_categories'
    AND INDEX_NAME = 'idx_fixed_asset_categories_expense_account'
);

SET @add_expense_index_sql := IF(
  @expense_index_exists = 0,
  'CREATE INDEX idx_fixed_asset_categories_expense_account ON fixed_asset_categories(company_id, expense_account_id)',
  'SELECT 1'
);

PREPARE add_expense_index_stmt FROM @add_expense_index_sql;
EXECUTE add_expense_index_stmt;
DEALLOCATE PREPARE add_expense_index_stmt;

SET @accum_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_categories'
    AND INDEX_NAME = 'idx_fixed_asset_categories_accum_account'
);

SET @add_accum_index_sql := IF(
  @accum_index_exists = 0,
  'CREATE INDEX idx_fixed_asset_categories_accum_account ON fixed_asset_categories(company_id, accum_depr_account_id)',
  'SELECT 1'
);

PREPARE add_accum_index_stmt FROM @add_accum_index_sql;
EXECUTE add_accum_index_stmt;
DEALLOCATE PREPARE add_accum_index_stmt;

SET @expense_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_categories'
    AND CONSTRAINT_NAME = 'fk_fixed_asset_categories_expense_account'
);

SET @add_expense_fk_sql := IF(
  @expense_fk_exists = 0,
  'ALTER TABLE fixed_asset_categories ADD CONSTRAINT fk_fixed_asset_categories_expense_account FOREIGN KEY (expense_account_id) REFERENCES accounts(id)',
  'SELECT 1'
);

PREPARE add_expense_fk_stmt FROM @add_expense_fk_sql;
EXECUTE add_expense_fk_stmt;
DEALLOCATE PREPARE add_expense_fk_stmt;

SET @accum_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_categories'
    AND CONSTRAINT_NAME = 'fk_fixed_asset_categories_accum_account'
);

SET @add_accum_fk_sql := IF(
  @accum_fk_exists = 0,
  'ALTER TABLE fixed_asset_categories ADD CONSTRAINT fk_fixed_asset_categories_accum_account FOREIGN KEY (accum_depr_account_id) REFERENCES accounts(id)',
  'SELECT 1'
);

PREPARE add_accum_fk_stmt FROM @add_accum_fk_sql;
EXECUTE add_accum_fk_stmt;
DEALLOCATE PREPARE add_accum_fk_stmt;
