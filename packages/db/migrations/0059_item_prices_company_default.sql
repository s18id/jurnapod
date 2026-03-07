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

-- Step 3: Make outlet_id nullable (idempotent)
SET @outlet_id_is_nullable = (
  SELECT IS_NULLABLE = 'YES'
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND column_name = 'outlet_id'
);

SET @stmt = IF(
  @outlet_id_is_nullable = 1,
  'SELECT 1',
  'ALTER TABLE item_prices MODIFY COLUMN outlet_id BIGINT UNSIGNED NULL COMMENT ''NULL = company default price, non-NULL = outlet override'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Add uniqueness constraint for company default (outlet_id IS NULL)
-- MySQL does not support partial indexes with WHERE clause like PostgreSQL,
-- so we use a unique index that treats NULL values distinctly.
-- For company defaults: we need one price per (company_id, item_id) when outlet_id IS NULL
-- For outlet overrides: we need one price per (company_id, outlet_id, item_id) when outlet_id IS NOT NULL

-- MySQL unique indexes naturally allow multiple NULLs in a column,
-- but we want to prevent duplicate (company_id, item_id) when outlet_id IS NULL.
-- Solution: Use a generated column or check constraint (MySQL 8.0.16+)

-- Add a generated scope key column to enforce uniqueness (idempotent)
SET @scope_key_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND column_name = 'scope_key'
);

SET @stmt = IF(
  @scope_key_exists > 0,
  'SELECT 1',
  'ALTER TABLE item_prices ADD COLUMN scope_key VARCHAR(100) AS (CASE WHEN outlet_id IS NULL THEN CONCAT(''default:'', company_id, '':'', item_id) ELSE CONCAT(''override:'', company_id, '':'', outlet_id, '':'', item_id) END) STORED'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 5: Add unique constraint on scope_key (idempotent)
SET @scope_unique_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND index_name = 'uq_item_prices_scope'
);

SET @stmt = IF(
  @scope_unique_exists > 0,
  'SELECT 1',
  'ALTER TABLE item_prices ADD UNIQUE KEY uq_item_prices_scope (scope_key)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 6: Keep only company-scoped outlet FK semantics.
-- Legacy single-column FK (outlet_id -> outlets.id) is intentionally not re-added.

-- Step 7: Validate and add company-scoped outlet FK if not exists (from migration 0004)
SET @outlet_fk_invalid_rows = (
  SELECT COUNT(*)
  FROM item_prices ip
  LEFT JOIN outlets o
    ON o.company_id = ip.company_id
   AND o.id = ip.outlet_id
  WHERE ip.outlet_id IS NOT NULL
    AND o.id IS NULL
);

SET @outlet_fk_error_message = IF(
  @outlet_fk_invalid_rows > 0,
  CONCAT(
    'migration 0059 preflight failed: item_prices has ',
    @outlet_fk_invalid_rows,
    ' rows with invalid (company_id, outlet_id). fix data, rerun db:migrate'
  ),
  NULL
);

SET @stmt = IF(
  @outlet_fk_error_message IS NULL,
  'SELECT 1',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = @outlet_fk_error_message'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'outlets'
    GROUP BY index_name
    HAVING SUM(seq_in_index = 1 AND column_name = 'company_id') = 1
      AND SUM(seq_in_index = 2 AND column_name = 'id') = 1
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE outlets ADD KEY idx_outlets_company_id_id (company_id, id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create dedicated 2-column index for FK if not exists
-- This ensures MySQL 8 has an explicit index for the compound FK
SET @idx_company_outlet_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND index_name = 'idx_item_prices_company_outlet_fk'
);

SET @stmt = IF(
  @idx_company_outlet_exists > 0,
  'SELECT 1',
  'ALTER TABLE item_prices ADD KEY idx_item_prices_company_outlet_fk (company_id, outlet_id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
-- CRITICAL: Add new indexes BEFORE dropping old index to avoid breaking FK support

-- Add new indexes optimized for both scopes (idempotent)
-- Index for outlet-specific queries (effective price resolution)
SET @new_idx_outlet_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND index_name = 'idx_item_prices_outlet_item_active'
);

SET @stmt = IF(
  @new_idx_outlet_exists > 0,
  'SELECT 1',
  'ALTER TABLE item_prices ADD INDEX idx_item_prices_outlet_item_active (company_id, outlet_id, item_id, is_active)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for company default queries (idempotent)
-- Note: MySQL does not support filtered indexes (WHERE outlet_id IS NULL)
-- Create a regular index that includes all rows; MySQL optimizer will use it efficiently
SET @new_idx_default_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'item_prices'
    AND index_name = 'idx_item_prices_company_default_fallback'
);

SET @stmt = IF(
  @new_idx_default_exists > 0,
  'SELECT 1',
  'ALTER TABLE item_prices ADD INDEX idx_item_prices_company_default_fallback (company_id, item_id, is_active)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop old index if exists (now safe after new index created)
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

-- Step 9: Add comment to table for documentation
ALTER TABLE item_prices
  COMMENT = 'Item prices: outlet_id=NULL for company default, outlet_id=N for outlet override. Effective price resolution: override > default.';
