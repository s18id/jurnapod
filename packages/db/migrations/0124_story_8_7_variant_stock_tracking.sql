-- Migration: 0124_story_8_7_variant_stock_tracking.sql
-- Story: 8.7 Variant Stock Tracking
-- Description: Add variant stock tracking support to inventory_stock table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Check if variant_id column already exists in inventory_stock
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_stock'
  AND COLUMN_NAME = 'variant_id';

-- Add variant_id column if it doesn't exist
SET @alter_stmt = IF(@col_exists = 0,
  'ALTER TABLE inventory_stock ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id',
  'SELECT ''variant_id column already exists'' AS status');

PREPARE stmt FROM @alter_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add unique constraint for company+outlet+product+variant combination
-- First check if unique index already exists
SELECT COUNT(*) INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_stock'
  AND INDEX_NAME = 'uq_inventory_stock_company_outlet_product_variant';

SET @add_idx = IF(@idx_exists = 0,
  'ALTER TABLE inventory_stock ADD UNIQUE INDEX uq_inventory_stock_company_outlet_product_variant (company_id, outlet_id, product_id, variant_id)',
  'SELECT ''variant unique index already exists'' AS status');

PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for variant lookups
SELECT COUNT(*) INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_stock'
  AND INDEX_NAME = 'idx_inventory_stock_variant';

SET @add_idx = IF(@idx_exists = 0,
  'ALTER TABLE inventory_stock ADD INDEX idx_inventory_stock_variant (company_id, variant_id)',
  'SELECT ''variant index already exists'' AS status');

PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;