-- Migration: 0082_add_cogs_account_fields_to_items.sql
-- Story: 4.5 COGS Integration
-- Description: Add COGS and Inventory Asset account mappings to items table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;

-- Add cogs_account_id column if not exists
SELECT COUNT(*) INTO @cogs_col_exists
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'items' 
  AND COLUMN_NAME = 'cogs_account_id';

SET @add_cogs_col = IF(@cogs_col_exists = 0, 
  'ALTER TABLE items ADD COLUMN cogs_account_id BIGINT UNSIGNED NULL AFTER item_type, 
   ADD CONSTRAINT fk_items_cogs_account FOREIGN KEY (cogs_account_id) REFERENCES accounts(id)',
  'SELECT 1');
PREPARE stmt FROM @add_cogs_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add inventory_asset_account_id column if not exists
SELECT COUNT(*) INTO @inv_col_exists
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'items' 
  AND COLUMN_NAME = 'inventory_asset_account_id';

SET @add_inv_col = IF(@inv_col_exists = 0, 
  'ALTER TABLE items ADD COLUMN inventory_asset_account_id BIGINT UNSIGNED NULL AFTER cogs_account_id,
   ADD CONSTRAINT fk_items_inventory_account FOREIGN KEY (inventory_asset_account_id) REFERENCES accounts(id)',
  'SELECT 1');
PREPARE stmt FROM @add_inv_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indexes for account lookups
SELECT COUNT(*) INTO @cogs_idx_exists
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'items' 
  AND INDEX_NAME = 'idx_items_cogs_account';

SET @add_cogs_idx = IF(@cogs_idx_exists = 0,
  'CREATE INDEX idx_items_cogs_account ON items(company_id, cogs_account_id)',
  'SELECT 1');
PREPARE stmt FROM @add_cogs_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @inv_idx_exists
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'items' 
  AND INDEX_NAME = 'idx_items_inventory_account';

SET @add_inv_idx = IF(@inv_idx_exists = 0,
  'CREATE INDEX idx_items_inventory_account ON items(company_id, inventory_asset_account_id)',
  'SELECT 1');
PREPARE stmt FROM @add_inv_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
