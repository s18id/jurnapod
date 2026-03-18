-- Migration 0089: Add variant_id columns to sync-related tables
-- Supports variant transaction lineage tracking
-- Rerunnable: Safe to run multiple times

-- ============================================================================
-- pos_transaction_items: Add variant_id column
-- ============================================================================
SET @add_variant_id_pti = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_transaction_items' 
    AND column_name = 'variant_id'
);

SET @sql = IF(@add_variant_id_pti = 1,
  'ALTER TABLE pos_transaction_items ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER item_id',
  'SELECT ''variant_id already exists on pos_transaction_items'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add composite index for company_id+outlet_id+variant_id query path
SET @add_index_pti = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_transaction_items' 
    AND index_name = 'idx_pti_company_outlet_variant'
);

SET @sql = IF(@add_index_pti = 1,
  'ALTER TABLE pos_transaction_items ADD INDEX idx_pti_company_outlet_variant (company_id, outlet_id, variant_id)',
  'SELECT ''idx_pti_company_outlet_variant already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- pos_order_snapshot_lines: Add variant_id column
-- ============================================================================
SET @add_variant_id_posl = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_order_snapshot_lines' 
    AND column_name = 'variant_id'
);

SET @sql = IF(@add_variant_id_posl = 1,
  'ALTER TABLE pos_order_snapshot_lines ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER item_id',
  'SELECT ''variant_id already exists on pos_order_snapshot_lines'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add composite index for order_id+variant_id query path
SET @add_index_posl = (
  SELECT COUNT(*) = 0 FROM information_schema.STATISTICS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_order_snapshot_lines' 
    AND index_name = 'idx_posl_order_variant'
);

SET @sql = IF(@add_index_posl = 1,
  'ALTER TABLE pos_order_snapshot_lines ADD INDEX idx_posl_order_variant (order_id, variant_id)',
  'SELECT ''idx_posl_order_variant already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- pos_item_cancellations: Add variant_id column
-- ============================================================================
SET @add_variant_id_pic = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS 
  WHERE table_schema = DATABASE() 
    AND table_name = 'pos_item_cancellations' 
    AND column_name = 'variant_id'
);

SET @sql = IF(@add_variant_id_pic = 1,
  'ALTER TABLE pos_item_cancellations ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER item_id',
  'SELECT ''variant_id already exists on pos_item_cancellations'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
