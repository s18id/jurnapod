-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- ============================================================
-- Migration: Fix fiscal_years columns after partial migration failure
-- Purpose: Recovery migration for databases where 0116 failed partially
-- RERUNNABLE: Safe to run multiple times
-- SIMPLIFIED: Uses NULL to avoid data truncation with existing rows
-- ============================================================

-- Step 1: Check current column state
SET @has_start_date = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date'
);

SET @has_end_date = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'end_date'
);

SET @has_start_new = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE()
    AND table_name = 'fiscal_years' 
    AND column_name = 'start_date_new'
);

SET @has_end_new = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'fiscal_years' 
    AND column_name = 'end_date_new'
);

-- Step 2: Handle broken state - start_date_new exists but start_date doesn't
-- This happens when migration 0116 dropped old columns but failed to rename new ones

-- If we have the new columns but not the final ones, rename them (allow NULL)
SET @rename_start = IF(@has_start_new > 0 AND @has_start_date = 0,
  'ALTER TABLE fiscal_years CHANGE COLUMN start_date_new start_date DATETIME NULL',
  'SELECT "start_date OK or no fix needed" as status'
);
PREPARE stmt FROM @rename_start;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rename_end = IF(@has_end_new > 0 AND @has_end_date = 0,
  'ALTER TABLE fiscal_years CHANGE COLUMN end_date_new end_date DATETIME NULL',
  'SELECT "end_date OK or no fix needed" as status'
);
PREPARE stmt FROM @rename_end;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Handle worst case - columns completely missing
-- Add columns as NULL to avoid data truncation with existing rows

SET @add_start = IF(@has_start_date = 0 AND @has_start_new = 0,
  'ALTER TABLE fiscal_years ADD COLUMN start_date DATETIME NULL',
  'SELECT "start_date exists" as status'
);
PREPARE stmt FROM @add_start;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_end = IF(@has_end_date = 0 AND @has_end_new = 0,
  'ALTER TABLE fiscal_years ADD COLUMN end_date DATETIME NULL',
  'SELECT "end_date exists" as status'
);
PREPARE stmt FROM @add_end;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Cleanup - remove temporary columns if they still exist after rename
SET @drop_start_new = IF(@has_start_new > 0,
  'ALTER TABLE fiscal_years DROP COLUMN IF EXISTS start_date_new',
  'SELECT "no cleanup needed" as status'
);
PREPARE stmt FROM @drop_start_new;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_end_new = IF(@has_end_new > 0,
  'ALTER TABLE fiscal_years DROP COLUMN IF EXISTS end_date_new',
  'SELECT "no cleanup needed" as status'
);
PREPARE stmt FROM @drop_end_new;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 5: Verify fix worked
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

-- Output verification status
SELECT 
  IF(@verify_start > 0 AND @verify_end > 0, 
    'SUCCESS: fiscal_years columns fixed', 
    'WARNING: Columns may still be missing - check manually'
  ) as migration_status;

-- ============================================================
-- Notes:
-- - Handles all broken states from partial migration 0116
-- - Safe to run multiple times (idempotent)
-- - Uses NULL instead of NOT NULL to avoid data truncation errors
-- - Existing rows preserve their data; new rows get proper dates from app
-- ============================================================
