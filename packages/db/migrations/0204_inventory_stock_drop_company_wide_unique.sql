-- Migration: 0204_inventory_stock_drop_company_wide_unique.sql
-- Purpose: Remove conflicting company-wide uniqueness so outlet-scoped stock rows can coexist.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Drop legacy company-wide unique key if present.
-- This key blocks multiple outlet-scoped rows for the same company+product.
SET @has_company_wide_idx = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'inventory_stock'
    AND index_name = 'uq_inventory_stock_company_wide'
);

SET @drop_company_wide_idx_sql = IF(
  @has_company_wide_idx > 0,
  'ALTER TABLE inventory_stock DROP INDEX uq_inventory_stock_company_wide',
  'SELECT ''uq_inventory_stock_company_wide not found'' AS status'
);

PREPARE stmt_drop_company_wide_idx FROM @drop_company_wide_idx_sql;
EXECUTE stmt_drop_company_wide_idx;
DEALLOCATE PREPARE stmt_drop_company_wide_idx;

-- Ensure outlet-scoped uniqueness index exists.
SET @has_outlet_scope_idx = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'inventory_stock'
    AND index_name = 'uq_inventory_stock_company_outlet_product'
);

SET @add_outlet_scope_idx_sql = IF(
  @has_outlet_scope_idx = 0,
  'ALTER TABLE inventory_stock ADD UNIQUE INDEX uq_inventory_stock_company_outlet_product (company_id, outlet_id, product_id)',
  'SELECT ''uq_inventory_stock_company_outlet_product already exists'' AS status'
);

PREPARE stmt_add_outlet_scope_idx FROM @add_outlet_scope_idx_sql;
EXECUTE stmt_add_outlet_scope_idx;
DEALLOCATE PREPARE stmt_add_outlet_scope_idx;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
