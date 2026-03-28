-- Migration: 0128_story_15_3_effective_date_columns.sql
-- Story: 15.3 TD-030 Effective Date Filtering - Migration
-- Description: Add effective_from and effective_to columns (BIGINT unix ms) to item_prices for time-range price filtering
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Add effective_from column (BIGINT unix milliseconds)
-- Default 0 means "always effective from the beginning"
-- ============================================================================
SET @add_effective_from = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND column_name = 'effective_from'
);

SET @sql = IF(@add_effective_from = 1,
  'ALTER TABLE item_prices ADD COLUMN effective_from BIGINT NOT NULL DEFAULT 0 AFTER is_active',
  'SELECT ''effective_from already exists on item_prices'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add effective_to column (BIGINT unix milliseconds)
-- Default 0 means "no expiration (always effective)"
-- A value > 0 means the price expires at that timestamp
-- ============================================================================
SET @add_effective_to = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND column_name = 'effective_to'
);

SET @sql = IF(@add_effective_to = 1,
  'ALTER TABLE item_prices ADD COLUMN effective_to BIGINT NOT NULL DEFAULT 0 AFTER effective_from',
  'SELECT ''effective_to already exists on item_prices'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add index for efficient effective date range queries
-- ============================================================================
SET @add_effective_date_index = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND index_name = 'idx_item_prices_effective_dates'
);

SET @sql = IF(@add_effective_date_index = 1,
  'ALTER TABLE item_prices ADD INDEX idx_item_prices_effective_dates (company_id, item_id, effective_from, effective_to, is_active)',
  'SELECT ''idx_item_prices_effective_dates already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
