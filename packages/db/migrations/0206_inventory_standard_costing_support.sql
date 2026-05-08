-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)
--
-- Migration: 0206_inventory_standard_costing_support.sql
-- Purpose: Add schema support for per-item standard cost.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add items.standard_cost when missing.
SELECT COUNT(*) INTO @items_table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'items';

SELECT COUNT(*) INTO @items_standard_cost_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'items'
  AND COLUMN_NAME = 'standard_cost';

SELECT COUNT(*) INTO @items_inventory_asset_account_id_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'items'
  AND COLUMN_NAME = 'inventory_asset_account_id';

SET @add_items_standard_cost_sql = IF(
  @items_table_exists = 1 AND @items_standard_cost_exists = 0,
  IF(
    @items_inventory_asset_account_id_exists = 1,
    'ALTER TABLE items ADD COLUMN standard_cost DECIMAL(19,4) NULL COMMENT "Standard unit cost for standard-cost variance" AFTER inventory_asset_account_id',
    'ALTER TABLE items ADD COLUMN standard_cost DECIMAL(19,4) NULL COMMENT "Standard unit cost for standard-cost variance"'
  ),
  'SELECT ''items.standard_cost already exists or items table missing'' AS status'
);

PREPARE stmt_add_items_standard_cost FROM @add_items_standard_cost_sql;
EXECUTE stmt_add_items_standard_cost;
DEALLOCATE PREPARE stmt_add_items_standard_cost;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
