-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create inventory_stock table
-- Purpose: Track stock levels per company/outlet/product
-- Portable across MySQL 8.0+ and MariaDB

-- Create inventory_stock table if not exists
CREATE TABLE IF NOT EXISTS inventory_stock (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  reserved_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  available_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_stock_company_outlet_product (company_id, outlet_id, product_id),
  KEY idx_inventory_stock_company_product (company_id, product_id),
  KEY idx_inventory_stock_outlet (outlet_id),
  KEY idx_inventory_stock_company_updated (company_id, updated_at),
  CONSTRAINT chk_inventory_stock_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT chk_inventory_stock_reserved_non_negative CHECK (reserved_quantity >= 0),
  CONSTRAINT chk_inventory_stock_available_non_negative CHECK (available_quantity >= 0),
  CONSTRAINT chk_inventory_stock_available_formula CHECK (available_quantity = quantity - reserved_quantity),
  CONSTRAINT fk_inventory_stock_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_inventory_stock_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_inventory_stock_product FOREIGN KEY (product_id) REFERENCES items(id)
) ENGINE=InnoDB;

-- ============================================================
-- Add unique partial index for company-wide stock (outlet_id IS NULL)
-- Note: MySQL/MariaDB don't support partial indexes natively, so we use a generated column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_stock'
    AND COLUMN_NAME = 'outlet_id_is_null'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE inventory_stock ADD COLUMN outlet_id_is_null TINYINT(1) AS (CASE WHEN outlet_id IS NULL THEN 1 ELSE 0 END) VIRTUAL',
  'SELECT ''skip add outlet_id_is_null'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add unique constraint for company-wide stock (outlet_id is NULL)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_stock'
    AND INDEX_NAME = 'uq_inventory_stock_company_wide'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE inventory_stock ADD UNIQUE KEY uq_inventory_stock_company_wide (company_id, product_id, outlet_id_is_null)',
  'SELECT ''skip add uq_inventory_stock_company_wide'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
