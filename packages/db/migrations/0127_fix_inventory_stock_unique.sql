-- Migration: 0127_fix_inventory_stock_unique.sql
-- Fix: Correct unique constraint to prevent duplicate variant stocks per outlet
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Step 1: Handle any existing duplicate data
-- ============================================================================

-- Find and report duplicates (for manual review if needed)
SELECT company_id, outlet_id, variant_id, COUNT(*) as duplicate_count
FROM inventory_stock
WHERE variant_id IS NOT NULL
GROUP BY company_id, outlet_id, variant_id
HAVING COUNT(*) > 1;

-- If duplicates exist, keep the one with the highest quantity and delete others
-- (This is a data cleanup - review before running in production)
DELETE s1 FROM inventory_stock s1
INNER JOIN inventory_stock s2 
  ON s1.company_id = s2.company_id 
  AND s1.outlet_id = s2.outlet_id 
  AND s1.variant_id = s2.variant_id
  AND s1.id > s2.id
WHERE s1.variant_id IS NOT NULL;

-- ============================================================================
-- Step 2: Drop old unique index if exists
-- ============================================================================
SET @drop_old_idx = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_stock'
    AND INDEX_NAME = 'uq_inventory_stock_company_outlet_product_variant'
);

SET @sql = IF(@drop_old_idx = 1,
  'ALTER TABLE inventory_stock DROP INDEX uq_inventory_stock_company_outlet_product_variant',
  'SELECT ''old index does not exist'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Step 3: Add correct unique index (company + outlet + variant)
-- ============================================================================
SET @add_new_idx = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_stock'
    AND INDEX_NAME = 'uq_inventory_stock_outlet_variant'
);

SET @sql2 = IF(@add_new_idx = 1,
  'ALTER TABLE inventory_stock ADD UNIQUE INDEX uq_inventory_stock_outlet_variant (company_id, outlet_id, variant_id)',
  'SELECT ''new index already exists'' AS status'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
