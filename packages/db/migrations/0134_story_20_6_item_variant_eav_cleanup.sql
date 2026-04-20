-- Migration: 0134_story_20_6_item_variant_eav_cleanup.sql
-- Story: 20.6 Item Variant EAV Cleanup
-- Description: Add combination_hash column for deduplication and migrate all EAV data to item_variants.attributes JSON column
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci
-- IMPORTANT: This migration is idempotent - can be safely rerun

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Step 1: Add combination_hash column to item_variants for deduplication
-- ============================================================================
SET @col_exists = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_variants' 
    AND column_name = 'combination_hash'
);

SET @sql = IF(@col_exists = 1,
  'ALTER TABLE item_variants ADD COLUMN combination_hash VARCHAR(64) NULL COMMENT ''Hash of attribute combination for deduplication'' AFTER attributes',
  'SELECT ''combination_hash column already exists on item_variants'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Step 2: Add updated_at column if it doesn't exist (for tracking last sync)
-- ============================================================================
SET @col_exists = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_variants' 
    AND column_name = 'updated_at'
);

SET @sql = IF(@col_exists = 1,
  'ALTER TABLE item_variants ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER archived_at',
  'SELECT ''updated_at column already exists on item_variants'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Step 3: Create index on combination_hash for fast lookups and deduplication
-- ============================================================================
SET @idx_exists = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_variants' 
    AND index_name = 'idx_item_variants_combination_hash'
);

SET @sql = IF(@idx_exists = 1,
  'ALTER TABLE item_variants ADD INDEX idx_item_variants_combination_hash (combination_hash)',
  'SELECT ''idx_item_variants_combination_hash already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Step 4: Build attributes JSON from item_variant_combinations (already has data from migration 0123)
-- This ensures all variants have their attributes JSON properly populated
-- ============================================================================
UPDATE item_variants v
INNER JOIN (
  SELECT vc.variant_id, 
         JSON_OBJECTAGG(iva.attribute_name, ivav.value) AS new_attributes
  FROM item_variant_combinations vc
  JOIN item_variant_attributes iva ON iva.id = vc.attribute_id
  JOIN item_variant_attribute_values ivav ON ivav.id = vc.value_id
  GROUP BY vc.variant_id
) agg ON agg.variant_id = v.id
SET v.attributes = agg.new_attributes
WHERE v.attributes IS NULL;

-- ============================================================================
-- Step 5: Build combination_hash for deduplication (SHA2-256 of attributes)
-- Only for variants that have attributes populated
-- ============================================================================
UPDATE item_variants
SET combination_hash = SHA2(attributes, 256)
WHERE attributes IS NOT NULL AND combination_hash IS NULL;

-- ============================================================================
-- Step 6: Migrate item_variant_combinations data to attributes JSON
-- For variants created directly via item_variant_combinations table
-- This handles cases where combination_hash is populated but attributes may need refresh
-- ============================================================================
-- First, refresh attributes from the EAV tables for all variants
UPDATE item_variants v
INNER JOIN (
  SELECT vc.variant_id, 
         JSON_OBJECTAGG(iva.attribute_name, ivav.value) AS new_attributes
  FROM item_variant_combinations vc
  JOIN item_variant_attributes iva ON iva.id = vc.attribute_id
  JOIN item_variant_attribute_values ivav ON ivav.id = vc.value_id
  GROUP BY vc.variant_id
) agg ON agg.variant_id = v.id
SET v.attributes = agg.new_attributes,
    v.combination_hash = SHA2(agg.new_attributes, 256)
WHERE v.attributes IS NULL OR v.combination_hash IS NULL;

-- ============================================================================
-- Step 7: Update combination_hash for any remaining variants that have attributes but no hash
-- ============================================================================
UPDATE item_variants
SET combination_hash = SHA2(attributes, 256)
WHERE attributes IS NOT NULL 
  AND combination_hash IS NULL;

-- ============================================================================
-- Step 8: Drop the trigger that was syncing attributes (no longer needed with direct JSON storage)
-- Note: DROP TRIGGER cannot be PREPAREd in MySQL; use direct execution.
--       IF EXISTS makes it idempotent.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_item_variants_sync_attributes;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;

-- ============================================================================
-- Verification queries (can be run manually to verify migration)
-- ============================================================================
-- SELECT COUNT(*) AS total_variants FROM item_variants;
-- SELECT COUNT(*) AS variants_with_attributes FROM item_variants WHERE attributes IS NOT NULL;
-- SELECT COUNT(*) AS variants_with_hash FROM item_variants WHERE combination_hash IS NOT NULL;
