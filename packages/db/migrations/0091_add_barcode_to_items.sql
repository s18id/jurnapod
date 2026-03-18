-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)
-- Migration: 0091 - Add barcode support to items table

-- Rerunnable/Idempotent migration for MySQL 8.0+ and MariaDB
-- Each statement is independent and safe to re-run

-- ============================================================================
-- Add barcode column
-- ============================================================================
SET @add_barcode = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'items' 
    AND column_name = 'barcode'
);

SET @sql = IF(@add_barcode = 1,
  'ALTER TABLE items ADD COLUMN barcode VARCHAR(100) NULL AFTER sku',
  'SELECT ''barcode column already exists on items'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add barcode_type column
-- ============================================================================
SET @add_barcode_type = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'items' 
    AND column_name = 'barcode_type'
);

SET @sql = IF(@add_barcode_type = 1,
  'ALTER TABLE items ADD COLUMN barcode_type ENUM(\'EAN13\', \'UPCA\', \'CODE128\', \'CUSTOM\') NULL AFTER barcode',
  'SELECT ''barcode_type column already exists on items'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add unique index for barcode uniqueness (company_id, barcode)
-- Uniqueness enforced only for non-null barcodes
-- Pre-check for duplicates before creating unique index
-- ============================================================================
SET @add_barcode_unique = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'items' 
    AND index_name = 'idx_items_barcode_unique'
);

-- Check for duplicate (company_id, barcode) combinations
-- Include empty strings since unique index will enforce them
SET @duplicate_count = (
  SELECT COUNT(*) FROM (
    SELECT company_id, barcode, COUNT(*) as cnt
    FROM items
    WHERE barcode IS NOT NULL
    GROUP BY company_id, barcode
    HAVING cnt > 1
  ) AS dups
);

SET @sql = CASE
  WHEN @add_barcode_unique = 0 THEN
    'SELECT ''idx_items_barcode_unique index already exists on items'' AS status'
  WHEN @duplicate_count > 0 THEN
    'SELECT CONCAT(''WARNING: Cannot create unique index - '', @duplicate_count, '' duplicate barcode(s) found. Please resolve duplicates first.'') AS status'
  ELSE
    'ALTER TABLE items ADD UNIQUE INDEX idx_items_barcode_unique (company_id, barcode)'
END;

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Update column comments (only if columns exist)
-- ============================================================================
SET @barcode_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'items' 
    AND column_name = 'barcode'
);

SET @sql = IF(@barcode_exists = 1,
  'ALTER TABLE items MODIFY COLUMN barcode VARCHAR(100) NULL COMMENT \'Product barcode (EAN-13, UPC-A, Code128, or custom)\'',
  'SELECT ''barcode column does not exist, skipping comment update'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @barcode_type_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'items' 
    AND column_name = 'barcode_type'
);

SET @sql = IF(@barcode_type_exists = 1,
  'ALTER TABLE items MODIFY COLUMN barcode_type ENUM(\'EAN13\', \'UPCA\', \'CODE128\', \'CUSTOM\') NULL COMMENT \'Barcode format type for validation\'',
  'SELECT ''barcode_type column does not exist, skipping comment update'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
