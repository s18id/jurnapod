-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)
-- Migration: 0094 - Null-safe uniqueness for variant snapshot lines
-- Ensures one non-variant line per order+item while allowing distinct variants

-- Rerunnable/Idempotent migration for MySQL 8.0+ and MariaDB
-- Strategy:
--   1) Add generated normalization column variant_id_key = COALESCE(variant_id, 0)
--   2) Drop legacy/flawed unique keys if present
--   3) Add unique key on (order_id, item_id, variant_id_key)

-- ============================================================================
-- Add generated normalization column for null-safe uniqueness
-- ============================================================================
SET @add_variant_id_key = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND column_name = 'variant_id_key'
);

SET @has_variant_id = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND column_name = 'variant_id'
);

SET @has_normalized_conflicts = (
  SELECT IF(
    @has_variant_id = 0,
    0,
    EXISTS(
      SELECT 1
      FROM pos_order_snapshot_lines
      GROUP BY order_id, item_id, COALESCE(variant_id, 0)
      HAVING COUNT(*) > 1
      LIMIT 1
    )
  )
);

SET @can_apply_variant_unique = IF(@has_variant_id = 1 AND @has_normalized_conflicts = 0, 1, 0);

SET @sql = CASE
  WHEN @add_variant_id_key = 0 THEN
    'SELECT ''variant_id_key column already exists on pos_order_snapshot_lines'' AS status'
  WHEN @has_variant_id = 0 THEN
    'SELECT ''variant_id column missing on pos_order_snapshot_lines; skipping variant_id_key creation'' AS status'
  ELSE
    'ALTER TABLE pos_order_snapshot_lines ADD COLUMN variant_id_key BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(variant_id, 0)) STORED'
END;
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Drop legacy unique key (order_id, item_id) if present
-- ============================================================================
SET @drop_legacy_unique = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND index_name = 'uq_pos_order_snapshot_lines_order_item'
);

SET @sql = CASE
  WHEN @can_apply_variant_unique = 0 THEN
    'SELECT ''Skipping legacy unique index drop: variant_id missing or normalized duplicate rows detected'' AS status'
  WHEN @drop_legacy_unique = 1 THEN
    'ALTER TABLE pos_order_snapshot_lines DROP INDEX uq_pos_order_snapshot_lines_order_item'
  ELSE
    'SELECT ''Legacy unique index uq_pos_order_snapshot_lines_order_item already dropped'' AS status'
END;
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Drop intermediate flawed unique key (order_id, item_id, variant_id) if present
-- ============================================================================
SET @drop_variant_unique = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND index_name = 'uq_pos_order_snapshot_lines_order_item_variant'
);

SET @sql = CASE
  WHEN @can_apply_variant_unique = 0 THEN
    'SELECT ''Skipping intermediate unique index drop: variant_id missing or normalized duplicate rows detected'' AS status'
  WHEN @drop_variant_unique = 1 THEN
    'ALTER TABLE pos_order_snapshot_lines DROP INDEX uq_pos_order_snapshot_lines_order_item_variant'
  ELSE
    'SELECT ''Intermediate unique index uq_pos_order_snapshot_lines_order_item_variant already dropped'' AS status'
END;
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add null-safe unique key using generated variant_id_key
-- ============================================================================
SET @add_null_safe_unique = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND index_name = 'uq_pos_order_snapshot_lines_order_item_variant_key'
);

SET @has_variant_id_key = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND column_name = 'variant_id_key'
);

SET @sql = CASE
  WHEN @can_apply_variant_unique = 0 THEN
    'SELECT ''Skipping null-safe unique index creation: variant_id missing or normalized duplicate rows detected'' AS status'
  WHEN @add_null_safe_unique = 0 THEN
    'SELECT ''Null-safe unique index uq_pos_order_snapshot_lines_order_item_variant_key already exists'' AS status'
  WHEN @has_variant_id_key = 0 THEN
    'SELECT ''variant_id_key column missing on pos_order_snapshot_lines; skipping null-safe unique index creation'' AS status'
  ELSE
    'ALTER TABLE pos_order_snapshot_lines ADD UNIQUE INDEX uq_pos_order_snapshot_lines_order_item_variant_key (order_id, item_id, variant_id_key)'
END;
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
