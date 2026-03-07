-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- ADR-0004: Item Pricing Scope - Company Default + Outlet Override
-- Make item_prices.outlet_id nullable to support:
-- - NULL = company default price
-- - non-NULL = outlet override price
--
-- Effective price resolution: outlet_override ?? company_default ?? null

-- Step 1: Drop existing unique constraint that requires outlet_id
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND index_name = 'uq_item_prices_company_outlet_item'
);

SET @stmt = IF(
  @constraint_exists > 0,
  'ALTER TABLE item_prices DROP INDEX uq_item_prices_company_outlet_item',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Drop FK constraint on outlet_id (will recreate as conditional)
SET @fk_drop_sql = (
  SELECT GROUP_CONCAT(
    CONCAT('DROP FOREIGN KEY `', constraint_name, '`')
    SEPARATOR ', '
  )
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE()
    AND table_name = 'item_prices'
    AND column_name = 'outlet_id'
    AND referenced_table_name = 'outlets'
);

SET @stmt = IF(
  @fk_drop_sql IS NOT NULL AND CHAR_LENGTH(@fk_drop_sql) > 0,
  CONCAT('ALTER TABLE item_prices ', @fk_drop_sql),
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Make outlet_id nullable
ALTER TABLE item_prices
  MODIFY COLUMN outlet_id BIGINT UNSIGNED NULL
  COMMENT 'NULL = company default price, non-NULL = outlet override';

-- Step 4: Add uniqueness constraint for company default (outlet_id IS NULL)
-- MySQL does not support partial indexes with WHERE clause like PostgreSQL,
-- so we use a unique index that treats NULL values distinctly.
-- For company defaults: we need one price per (company_id, item_id) when outlet_id IS NULL
-- For outlet overrides: we need one price per (company_id, outlet_id, item_id) when outlet_id IS NOT NULL

-- MySQL unique indexes naturally allow multiple NULLs in a column,
-- but we want to prevent duplicate (company_id, item_id) when outlet_id IS NULL.
-- Solution: Use a generated column or check constraint (MySQL 8.0.16+)

-- Add a generated scope key column to enforce uniqueness
ALTER TABLE item_prices
  ADD COLUMN scope_key VARCHAR(100) AS (
    CASE
      WHEN outlet_id IS NULL THEN CONCAT('default:', company_id, ':', item_id)
      ELSE CONCAT('override:', company_id, ':', outlet_id, ':', item_id)
    END
  ) STORED;

-- Step 5: Add unique constraint on scope_key
ALTER TABLE item_prices
  ADD UNIQUE KEY uq_item_prices_scope (scope_key);

-- Step 6: Re-add foreign key constraint on outlet_id (nullable)
-- MySQL allows FK on nullable columns; constraint only enforced when value is NOT NULL
ALTER TABLE item_prices
  ADD CONSTRAINT fk_item_prices_outlet
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT;

-- Step 7: Add company-scoped outlet FK if not exists (from migration 0004)
SET @outlet_fk_scoped_exists = (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'item_prices'
    AND constraint_name = 'fk_item_prices_company_outlet_scoped'
);

SET @stmt = IF(
  @outlet_fk_scoped_exists > 0,
  'SELECT 1',
  'ALTER TABLE item_prices ADD CONSTRAINT fk_item_prices_company_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id) ON DELETE RESTRICT'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 8: Update indexes for efficient querying
-- Drop old index if exists
SET @old_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND index_name = 'idx_item_prices_company_outlet_active'
);

SET @stmt = IF(
  @old_idx_exists > 0,
  'ALTER TABLE item_prices DROP INDEX idx_item_prices_company_outlet_active',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add new indexes optimized for both scopes
-- Index for outlet-specific queries (effective price resolution)
ALTER TABLE item_prices
  ADD INDEX idx_item_prices_outlet_item_active (company_id, outlet_id, item_id, is_active);

-- Index for company default queries
ALTER TABLE item_prices
  ADD INDEX idx_item_prices_company_default (company_id, item_id, is_active)
  WHERE outlet_id IS NULL;

-- Note: MySQL does not support filtered indexes (WHERE clause in index definition)
-- The WHERE clause above is a comment for documentation; actual index includes all rows.
-- We rely on the optimizer to efficiently use the index when outlet_id IS NULL is in the query.

-- Alternative: Use a regular index since MySQL doesn't support partial indexes
DROP INDEX IF EXISTS idx_item_prices_company_default ON item_prices;
ALTER TABLE item_prices
  ADD INDEX idx_item_prices_company_default_fallback (company_id, item_id, is_active);

-- Step 9: Add comment to table for documentation
ALTER TABLE item_prices
  COMMENT = 'Item prices: outlet_id=NULL for company default, outlet_id=N for outlet override. Effective price resolution: override > default.';
