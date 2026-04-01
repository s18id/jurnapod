-- Migration: 0133_story_20_8_data_import_count_columns.sql
-- Story: 20.8 - Data Import Count Columns
-- Description: Add count columns to data_imports table for better progress tracking
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add total_rows column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'data_imports' 
    AND column_name = 'total_rows'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE data_imports ADD COLUMN total_rows INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add success_count column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'data_imports' 
    AND column_name = 'success_count'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE data_imports ADD COLUMN success_count INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add error_count column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'data_imports' 
    AND column_name = 'error_count'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE data_imports ADD COLUMN error_count INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add warning_count column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'data_imports' 
    AND column_name = 'warning_count'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE data_imports ADD COLUMN warning_count INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add processed_rows computed column (stored)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'data_imports' 
    AND column_name = 'processed_rows'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE data_imports ADD COLUMN processed_rows INT UNSIGNED GENERATED ALWAYS AS (success_count + error_count) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add completion_percentage computed column (stored)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'data_imports' 
    AND column_name = 'completion_percentage'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE data_imports ADD COLUMN completion_percentage DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN total_rows > 0 THEN (processed_rows / total_rows) * 100 ELSE 0 END) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill counts from existing counts_json data
-- For completed imports, set total_rows = accounts + trns + alk, success_count = total_rows
-- For pending/failed imports, keep as 0 until reprocessed
UPDATE data_imports 
SET 
  total_rows = COALESCE(JSON_EXTRACT(counts_json, '$.accounts'), 0) 
             + COALESCE(JSON_EXTRACT(counts_json, '$.trns'), 0) 
             + COALESCE(JSON_EXTRACT(counts_json, '$.alk'), 0),
  success_count = CASE 
    WHEN status = 'COMPLETED' THEN 
      COALESCE(JSON_EXTRACT(counts_json, '$.accounts'), 0) 
      + COALESCE(JSON_EXTRACT(counts_json, '$.trns'), 0) 
      + COALESCE(JSON_EXTRACT(counts_json, '$.alk'), 0)
    ELSE 0
  END,
  error_count = CASE WHEN status != 'COMPLETED' THEN 1 ELSE 0 END,
  warning_count = 0
WHERE total_rows = 0 OR success_count = 0;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
