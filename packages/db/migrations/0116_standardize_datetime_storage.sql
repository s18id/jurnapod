-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- ============================================================
-- Migration: Standardize datetime storage to UTC
-- Convert fiscal_years DATE columns to DATETIME (UTC)
-- SIMPLIFIED: Sequential independent steps, no nested dynamic SQL
-- RERUNNABLE: Uses IF EXISTS checks
-- ============================================================

-- Step 1: Ensure all companies have a timezone (default to UTC)
UPDATE companies 
SET timezone = 'UTC' 
WHERE timezone IS NULL OR timezone = '';

-- Step 2: Check if migration is already complete
-- If start_date column exists and is DATETIME, skip everything
SET @start_date_is_datetime = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date'
    AND data_type = 'datetime'
);

-- If already DATETIME, nothing to do
SET @skip_migration = IF(@start_date_is_datetime > 0, 1, 0);

-- Only proceed if migration needed
SET @migration_msg = IF(@skip_migration = 1,
  'Migration already complete - skipping',
  'Running migration...'
);
SELECT @migration_msg as status;

-- Step 3: Add new columns (if migration needed)
-- Only run these if we haven't skipped

SET @add_start_new = IF(@skip_migration = 1,
  'SELECT 1',
  'ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS start_date_new DATETIME NULL'
);
PREPARE stmt FROM @add_start_new;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_end_new = IF(@skip_migration = 1,
  'SELECT 1',
  'ALTER TABLE fiscal_years ADD COLUMN IF NOT EXISTS end_date_new DATETIME NULL'
);
PREPARE stmt FROM @add_end_new;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Convert data from old DATE columns (if migration needed)
-- Check if old DATE columns exist
SET @has_old_start = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date' 
    AND data_type = 'date'
);

-- Only convert if we have old DATE columns
SET @do_convert = IF(@skip_migration = 1 OR @has_old_start = 0,
  'SELECT 1',
  'UPDATE fiscal_years fy
   JOIN companies c ON c.id = fy.company_id
   SET 
     fy.start_date_new = CONVERT_TZ(CONCAT(fy.start_date, " 00:00:00"), COALESCE(c.timezone, "UTC"), "+00:00"),
     fy.end_date_new = CONVERT_TZ(CONCAT(fy.end_date, " 23:59:59.999"), COALESCE(c.timezone, "UTC"), "+00:00")
   WHERE fy.start_date_new IS NULL'
);
PREPARE stmt FROM @do_convert;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 5: Rename new columns to final names (if migration needed)
SET @rename_cols = IF(@skip_migration = 1,
  'SELECT 1',
  'ALTER TABLE fiscal_years 
   CHANGE COLUMN start_date_new start_date DATETIME NULL,
   CHANGE COLUMN end_date_new end_date DATETIME NULL'
);
PREPARE stmt FROM @rename_cols;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 6: Drop old DATE columns if they still exist
SET @drop_old = IF(@skip_migration = 1 OR @has_old_start = 0,
  'SELECT 1',
  'ALTER TABLE fiscal_years DROP COLUMN IF EXISTS start_date, DROP COLUMN IF EXISTS end_date'
);
PREPARE stmt FROM @drop_old;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 7: Verify migration completed
SET @verify_start = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date'
    AND data_type = 'datetime'
);

SET @verify_end = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'end_date'
    AND data_type = 'datetime'
);

SELECT 
  IF(@verify_start > 0 AND @verify_end > 0, 
    'SUCCESS: Migration 0116 completed - columns are DATETIME', 
    'WARNING: Migration may have failed - run 0119 to fix'
  ) as migration_status;

-- ============================================================
-- Notes:
-- - All datetime fields now store UTC
-- - Company timezone used only for input/output conversion
-- - Fiscal year boundaries stored as UTC datetime
-- - SIMPLIFIED: Sequential independent steps avoid nested SQL issues
-- - Safe to run multiple times (idempotent)
-- ============================================================
