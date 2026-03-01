-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Add soft deletion support to accounts table
-- Description: Adds is_active column to enable soft deletion of accounts
--              and creates an index for efficient filtering by company and active status

-- Add is_active column to accounts table if it doesn't exist
SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'accounts'
      AND column_name = 'is_active'
  ),
  'SELECT 1',
  'ALTER TABLE accounts ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER name'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create index for efficient filtering by company and active status
SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'accounts'
      AND index_name = 'idx_accounts_active'
  ),
  'SELECT 1',
  'CREATE INDEX idx_accounts_active ON accounts (company_id, is_active)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
