-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add scope_key to enforce uniqueness with nullable outlet_id
SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'numbering_templates'
    AND COLUMN_NAME = 'scope_key'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE numbering_templates ADD COLUMN scope_key BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER outlet_id',
  'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

-- Backfill scope_key for existing rows
SET @backfill_sql := 'UPDATE numbering_templates SET scope_key = COALESCE(outlet_id, 0)';
PREPARE backfill_stmt FROM @backfill_sql;
EXECUTE backfill_stmt;
DEALLOCATE PREPARE backfill_stmt;

-- Add unique key for scope
SET @unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'numbering_templates'
    AND INDEX_NAME = 'uq_numbering_templates_company_scope_doc'
);

SET @add_unique_sql := IF(
  @unique_exists = 0,
  'CREATE UNIQUE INDEX uq_numbering_templates_company_scope_doc ON numbering_templates (company_id, doc_type, scope_key)',
  'SELECT 1'
);

PREPARE add_unique_stmt FROM @add_unique_sql;
EXECUTE add_unique_stmt;
DEALLOCATE PREPARE add_unique_stmt;

-- Ensure lookup index exists
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'numbering_templates'
    AND INDEX_NAME = 'idx_numbering_templates_lookup'
);

SET @add_idx_sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_numbering_templates_lookup ON numbering_templates (company_id, doc_type, is_active, outlet_id)',
  'SELECT 1'
);

PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;
