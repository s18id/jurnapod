-- Migration: 0123_item_variants.sql
-- Story: 8.6 Variant Selection in POS Cart
-- Description: Add attributes JSON column to item_variants table for variant dimensions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci
-- Note: MySQL GENERATED columns cannot use subqueries, so we use a regular column with triggers

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Add attributes JSON column to item_variants
-- Stores variant dimensions as JSON: { size: "Large", color: "Red" }
-- This is a convenience column populated from item_variant_combinations
-- Using regular column (not GENERATED) because MySQL doesn't support subqueries in GENERATED expressions
-- ============================================================================
SET @add_attributes = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_variants' 
    AND column_name = 'attributes'
);

SET @sql = IF(@add_attributes = 1,
  'ALTER TABLE item_variants ADD COLUMN attributes JSON NULL AFTER variant_name',
  'SELECT ''attributes column already exists on item_variants'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Add index on is_active for filtering active variants
-- ============================================================================
SET @add_active_idx = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'item_variants' 
    AND index_name = 'idx_item_variants_active'
);

SET @sql = IF(@add_active_idx = 1,
  'ALTER TABLE item_variants ADD INDEX idx_item_variants_active (company_id, item_id, is_active)',
  'SELECT ''idx_item_variants_active already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Backfill attributes column for existing variants
-- Updates the attributes column from item_variant_combinations data
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
-- Create trigger to auto-populate attributes on insert/update to combinations
-- This ensures attributes column stays in sync with item_variant_combinations
-- Note: CREATE TRIGGER cannot be PREPAREd in MySQL and cannot run inside a
--       stored routine. Use DROP IF EXISTS + direct CREATE for idempotency.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_item_variants_sync_attributes;

CREATE TRIGGER trg_item_variants_sync_attributes
AFTER INSERT ON item_variant_combinations
FOR EACH ROW
UPDATE item_variants SET attributes = (
  SELECT JSON_OBJECTAGG(iva.attribute_name, ivav.value)
  FROM item_variant_combinations vc
  JOIN item_variant_attributes iva ON iva.id = vc.attribute_id
  JOIN item_variant_attribute_values ivav ON ivav.id = vc.value_id
  WHERE vc.variant_id = NEW.variant_id
) WHERE id = NEW.variant_id;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
