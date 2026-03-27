-- Migration: 0122_story_8_5_variant_price_sync.sql
-- Story: 8.5 Variant Price Sync Enhancement
-- Description: Add variant_id column to item_prices table for variant-level pricing
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Add variant_id column to item_prices
-- ============================================================================
SET @add_variant_id = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND column_name = 'variant_id'
);

SET @sql = IF(@add_variant_id = 1,
  'ALTER TABLE item_prices ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER item_id',
  'SELECT ''variant_id already exists on item_prices'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add index on (company_id, id) to item_variants for FK reference
-- This index is required before adding the composite FK constraint
-- ============================================================================
SET @add_idx = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_variants' 
    AND index_name = 'idx_item_variants_company_id'
);

SET @sql = IF(@add_idx = 1,
  'ALTER TABLE item_variants ADD INDEX idx_item_variants_company_id (company_id, id)',
  'SELECT ''idx_item_variants_company_id already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add foreign key constraint for variant_id
-- Now we have the required index on item_variants(company_id, id)
-- ============================================================================
SET @fk_exists = (
  SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'item_prices'
    AND CONSTRAINT_NAME = 'fk_item_prices_variant'
);

SET @sql = IF(@fk_exists = 1,
  'ALTER TABLE item_prices ADD CONSTRAINT fk_item_prices_variant 
   FOREIGN KEY (company_id, variant_id) REFERENCES item_variants (company_id, id) ON DELETE CASCADE',
  'SELECT ''fk_item_prices_variant already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Update scope_key generated column to include variant_id
-- ============================================================================
SET @scope_key_exists = (
  SELECT COUNT(*) = 1 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND column_name = 'scope_key'
);

-- Drop the old scope_key if it exists
SET @sql = IF(@scope_key_exists = 1,
  'ALTER TABLE item_prices DROP COLUMN scope_key',
  'SELECT ''scope_key column does not exist or already dropped'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the new scope_key that includes variant_id
SET @add_scope_key = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND column_name = 'scope_key'
);

SET @sql = IF(@add_scope_key = 1,
  'ALTER TABLE item_prices ADD COLUMN scope_key VARCHAR(150) GENERATED ALWAYS AS (
    CASE 
      WHEN variant_id IS NOT NULL AND outlet_id IS NOT NULL THEN CONCAT(''variant_outlet:'', company_id, '':'', variant_id, '':'', outlet_id)
      WHEN variant_id IS NOT NULL AND outlet_id IS NULL THEN CONCAT(''variant_default:'', company_id, '':'', variant_id)
      WHEN variant_id IS NULL AND outlet_id IS NOT NULL THEN CONCAT(''override:'', company_id, '':'', outlet_id, '':'', item_id)
      ELSE CONCAT(''default:'', company_id, '':'', item_id)
    END
  ) VIRTUAL',
  'SELECT ''scope_key already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Recreate unique constraint on scope_key (MySQL requires explicit index for UNIQUE)
-- ============================================================================
SET @drop_unique = (
  SELECT COUNT(*) = 1 FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'item_prices' 
    AND INDEX_NAME = 'uq_item_prices_scope'
);

SET @sql = IF(@drop_unique = 1,
  'ALTER TABLE item_prices DROP INDEX uq_item_prices_scope',
  'SELECT ''uq_item_prices_scope does not exist'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = 'ALTER TABLE item_prices ADD UNIQUE INDEX uq_item_prices_scope (scope_key)';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add index on (company_id, variant_id) for variant price lookups
-- ============================================================================
SET @add_index = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND index_name = 'idx_item_prices_company_variant'
);

SET @sql = IF(@add_index = 1,
  'ALTER TABLE item_prices ADD INDEX idx_item_prices_company_variant (company_id, variant_id)',
  'SELECT ''idx_item_prices_company_variant already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add composite index for efficient price resolution queries
-- ============================================================================
SET @add_resolve_index = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_prices' 
    AND index_name = 'idx_item_prices_resolve'
);

SET @sql = IF(@add_resolve_index = 1,
  'ALTER TABLE item_prices ADD INDEX idx_item_prices_resolve (company_id, item_id, variant_id, outlet_id, is_active)',
  'SELECT ''idx_item_prices_resolve already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
