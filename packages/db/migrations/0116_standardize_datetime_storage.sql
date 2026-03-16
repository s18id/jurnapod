-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- ============================================================
-- Migration: Standardize datetime storage to UTC
-- Convert fiscal_years DATE columns to DATETIME (UTC)
-- RERUNNABLE: Uses IF EXISTS checks
-- ============================================================

-- Step 1: Ensure all companies have a timezone (default to UTC)
UPDATE companies 
SET timezone = 'UTC' 
WHERE timezone IS NULL OR timezone = '';

-- Step 2: Check if migration is already complete
-- If start_date column exists and is DATETIME, skip everything
SET @start_date_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date'
);

SET @start_date_is_datetime = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date'
    AND data_type = 'datetime'
);

-- If start_date exists and is already DATETIME, migration is complete
SET @skip_migration = IF(@start_date_exists > 0 AND @start_date_is_datetime > 0, 1, 0);

-- Only run migration if needed
SET @migration_sql = IF(@skip_migration = 1,
  'SELECT "Migration already complete - skipping" as status',
  '
  -- Check if we need to add new columns
  SET @has_start_new = (SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = "fiscal_years" AND column_name = "start_date_new");
  
  SET @has_end_new = (SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = "fiscal_years" AND column_name = "end_date_new");
  
  -- Add new columns if needed
  SET @add_start = IF(@has_start_new = 0, 
    "ALTER TABLE fiscal_years ADD COLUMN start_date_new DATETIME NULL", 
    "SELECT 1");
  PREPARE stmt FROM @add_start;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  
  SET @add_end = IF(@has_end_new = 0,
    "ALTER TABLE fiscal_years ADD COLUMN end_date_new DATETIME NULL",
    "SELECT 1");
  PREPARE stmt FROM @add_end;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  
  -- Convert data from old columns if they exist
  SET @has_old_start = (SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = "fiscal_years" AND column_name = "start_date" AND data_type = "date");
  
  SET @do_convert = IF(@has_old_start > 0,
    "UPDATE fiscal_years fy
     JOIN companies c ON c.id = fy.company_id
     SET 
       fy.start_date_new = CONVERT_TZ(CONCAT(fy.start_date, \" 00:00:00\"), COALESCE(c.timezone, \"UTC\"), \"+00:00\"),
       fy.end_date_new = CONVERT_TZ(CONCAT(fy.end_date, \" 23:59:59.999\"), COALESCE(c.timezone, \"UTC\"), \"+00:00\")
     WHERE fy.start_date_new IS NULL",
    "SELECT 1");
  PREPARE stmt FROM @do_convert;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  
  -- Drop old columns if they exist
  SET @drop_old = IF(@has_old_start > 0,
    "ALTER TABLE fiscal_years DROP COLUMN start_date, DROP COLUMN end_date",
    "SELECT 1");
  PREPARE stmt FROM @drop_old;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  
  -- Rename new columns
  SET @rename_cols = "ALTER TABLE fiscal_years 
    CHANGE COLUMN start_date_new start_date DATETIME NOT NULL,
    CHANGE COLUMN end_date_new end_date DATETIME NOT NULL";
  PREPARE stmt FROM @rename_cols;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  '
);

PREPARE migration FROM @migration_sql;
EXECUTE migration;
DEALLOCATE PREPARE migration;

-- ============================================================
-- Notes:
-- - All datetime fields now store UTC
-- - Company timezone used only for input/output conversion
-- - Fiscal year boundaries stored as UTC datetime
-- ============================================================
