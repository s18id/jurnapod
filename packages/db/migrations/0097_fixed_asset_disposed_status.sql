-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Fixed Asset Lifecycle: Add disposed status tracking to fixed_assets

SET @disposed_at_column_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_assets'
    AND COLUMN_NAME = 'disposed_at'
);

SET @add_column_sql := IF(
  @disposed_at_column_exists = 0,
  'ALTER TABLE fixed_assets ADD COLUMN disposed_at DATETIME DEFAULT NULL AFTER is_active',
  'SELECT ''Column already exists'''
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

SET @disposed_at_index_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_assets'
    AND INDEX_NAME = 'idx_fixed_assets_disposed'
);

SET @add_index_sql := IF(
  @disposed_at_index_exists = 0,
  'CREATE INDEX idx_fixed_assets_disposed ON fixed_assets(disposed_at)',
  'SELECT ''Index already exists'''
);

PREPARE add_index_stmt FROM @add_index_sql;
EXECUTE add_index_stmt;
DEALLOCATE PREPARE add_index_stmt;
