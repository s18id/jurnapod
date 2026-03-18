-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)
-- Migration: 0093 - Add variant_name_snapshot to pos_order_snapshot_lines
-- Supports variant name persistence in active order snapshots for sync pull

-- Rerunnable/Idempotent migration for MySQL 8.0+ and MariaDB
-- Each statement is independent and safe to re-run

-- ============================================================================
-- Add variant_name_snapshot column
-- ============================================================================
SET @add_variant_name_snapshot = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_order_snapshot_lines' 
    AND column_name = 'variant_name_snapshot'
);

SET @has_variant_id = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'pos_order_snapshot_lines'
    AND column_name = 'variant_id'
);

SET @sql = CASE
  WHEN @add_variant_name_snapshot = 0 THEN
    'SELECT ''variant_name_snapshot column already exists on pos_order_snapshot_lines'' AS status'
  WHEN @has_variant_id = 1 THEN
    'ALTER TABLE pos_order_snapshot_lines ADD COLUMN variant_name_snapshot VARCHAR(255) NULL AFTER variant_id'
  ELSE
    'ALTER TABLE pos_order_snapshot_lines ADD COLUMN variant_name_snapshot VARCHAR(255) NULL AFTER item_id'
END;
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Update column comment (only if column exists)
-- ============================================================================
SET @column_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_order_snapshot_lines' 
    AND column_name = 'variant_name_snapshot'
);

SET @sql = IF(@column_exists = 1,
  'ALTER TABLE pos_order_snapshot_lines MODIFY COLUMN variant_name_snapshot VARCHAR(255) NULL COMMENT ''Variant name at time of order for audit trail''',
  'SELECT ''variant_name_snapshot column does not exist, skipping comment update'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
