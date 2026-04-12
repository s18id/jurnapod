-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0157_drop_company_settings
-- Description: Drop legacy company_settings table after full migration to typed settings tables
-- Risk: HIGH - Drops legacy table

-- This migration assumes migration 0137 (settings system migration) has already run
-- and all data has been migrated to settings_strings, settings_numbers, settings_booleans.

-- Step 1: Delete all rows from company_settings (data should already be migrated)
DELETE FROM company_settings;

-- Step 2: Drop the table
DROP TABLE IF EXISTS company_settings;

-- Verify table was dropped
SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_settings'
);
SELECT IF(@table_exists = 0, 'SUCCESS: company_settings dropped', 'WARNING: company_settings still exists') AS result;
