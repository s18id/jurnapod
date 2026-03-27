-- Migration: 0126_inventory_transactions_variant.sql
-- Story: 8.7 Variant Stock Tracking - Fix gap
-- Description: Add variant_id column to inventory_transactions for variant stock audit trail
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Add variant_id column to inventory_transactions
-- ============================================================================

-- 1. Check if variant_id column already exists
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_transactions'
  AND COLUMN_NAME = 'variant_id';

-- Add variant_id column if it doesn't exist
SET @alter_stmt = IF(@col_exists = 0,
  'ALTER TABLE inventory_transactions ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id',
  'SELECT ''variant_id column already exists'' AS status');

PREPARE stmt FROM @alter_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Make product_id nullable (existing code doesn't provide product_id when inserting variant stock movements)
SET @modify_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_transactions'
    AND COLUMN_NAME = 'product_id'
    AND IS_NULLABLE = 'NO'
);

SET @alter_stmt2 = IF(@modify_exists = 1,
  'ALTER TABLE inventory_transactions MODIFY COLUMN product_id BIGINT UNSIGNED NULL',
  'SELECT ''product_id already nullable'' AS status');

PREPARE stmt2 FROM @alter_stmt2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. Add index for variant lookups
SELECT COUNT(*) INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_transactions'
  AND INDEX_NAME = 'idx_inventory_transactions_variant';

SET @add_idx = IF(@idx_exists = 0,
  'ALTER TABLE inventory_transactions ADD INDEX idx_inventory_transactions_variant (company_id, variant_id)',
  'SELECT ''variant index already exists'' AS status');

PREPARE stmt3 FROM @add_idx;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;