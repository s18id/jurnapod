-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add soft-delete support for companies

SET @companies_deleted_at_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'deleted_at'
);

SET @add_companies_deleted_at_sql := IF(
  @companies_deleted_at_exists = 0,
  'ALTER TABLE companies ADD COLUMN deleted_at DATETIME DEFAULT NULL AFTER updated_at',
  'SELECT 1'
);

PREPARE stmt FROM @add_companies_deleted_at_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @companies_deleted_at_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND INDEX_NAME = 'idx_companies_deleted_at'
);

SET @add_companies_deleted_at_index_sql := IF(
  @companies_deleted_at_index_exists = 0,
  'CREATE INDEX idx_companies_deleted_at ON companies(deleted_at)',
  'SELECT 1'
);

PREPARE stmt FROM @add_companies_deleted_at_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
