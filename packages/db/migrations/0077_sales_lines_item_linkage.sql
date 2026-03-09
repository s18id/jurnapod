-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Phase 5: Product/Item Linkage
-- Adds line_type and item_id to sales_invoice_lines and sales_order_lines
-- Includes tenant-safe FKs and PRODUCT/item_id enforcement

-- ============================================================
-- Helper: Drop legacy single-column item FK if exists
-- ============================================================
SET @legacy_invoice_fk_sql = (
  SELECT GROUP_CONCAT(
    CONCAT(
      'DROP FOREIGN KEY `',
      REPLACE(legacy.constraint_name, '`', '``'),
      '`'
    )
    ORDER BY legacy.constraint_name
    SEPARATOR ', '
  )
  FROM (
    SELECT kcu.constraint_name
    FROM information_schema.key_column_usage kcu
    WHERE kcu.constraint_schema = DATABASE()
      AND kcu.table_name = 'sales_invoice_lines'
    GROUP BY kcu.constraint_name
    HAVING COUNT(*) = 1
      AND SUM(
        kcu.column_name = 'item_id'
        AND kcu.referenced_table_name = 'items'
        AND kcu.referenced_column_name = 'id'
      ) = 1
  ) legacy
);

SET @drop_legacy_invoice_fk = IF(
  @legacy_invoice_fk_sql IS NULL OR CHAR_LENGTH(@legacy_invoice_fk_sql) = 0,
  'SELECT 1',
  CONCAT('ALTER TABLE sales_invoice_lines ', @legacy_invoice_fk_sql)
);

PREPARE drop_legacy_invoice_fk_stmt FROM @drop_legacy_invoice_fk;
EXECUTE drop_legacy_invoice_fk_stmt;
DEALLOCATE PREPARE drop_legacy_invoice_fk_stmt;

SET @legacy_order_fk_sql = (
  SELECT GROUP_CONCAT(
    CONCAT(
      'DROP FOREIGN KEY `',
      REPLACE(legacy.constraint_name, '`', '``'),
      '`'
    )
    ORDER BY legacy.constraint_name
    SEPARATOR ', '
  )
  FROM (
    SELECT kcu.constraint_name
    FROM information_schema.key_column_usage kcu
    WHERE kcu.constraint_schema = DATABASE()
      AND kcu.table_name = 'sales_order_lines'
    GROUP BY kcu.constraint_name
    HAVING COUNT(*) = 1
      AND SUM(
        kcu.column_name = 'item_id'
        AND kcu.referenced_table_name = 'items'
        AND kcu.referenced_column_name = 'id'
      ) = 1
  ) legacy
);

SET @drop_legacy_order_fk = IF(
  @legacy_order_fk_sql IS NULL OR CHAR_LENGTH(@legacy_order_fk_sql) = 0,
  'SELECT 1',
  CONCAT('ALTER TABLE sales_order_lines ', @legacy_order_fk_sql)
);

PREPARE drop_legacy_order_fk_stmt FROM @drop_legacy_order_fk;
EXECUTE drop_legacy_order_fk_stmt;
DEALLOCATE PREPARE drop_legacy_order_fk_stmt;

-- ============================================================
-- Helper: Ensure items has composite index (company_id, id)
-- ============================================================
SET @items_company_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'items'
    AND INDEX_NAME = 'idx_items_company_id_id'
);

SET @add_items_company_idx_sql := IF(
  @items_company_id_idx_exists = 0,
  'ALTER TABLE items ADD KEY idx_items_company_id_id (company_id, id)',
  'SELECT 1'
);

PREPARE add_items_company_idx_stmt FROM @add_items_company_idx_sql;
EXECUTE add_items_company_idx_stmt;
DEALLOCATE PREPARE add_items_company_idx_stmt;

-- ============================================================
-- sales_invoice_lines: Add line_type column
-- ============================================================
SET @invoice_line_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND COLUMN_NAME = 'line_type'
);

SET @add_invoice_line_type_sql := IF(
  @invoice_line_type_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD COLUMN line_type VARCHAR(16) NOT NULL DEFAULT ''SERVICE'' AFTER line_no',
  'SELECT 1'
);

PREPARE add_invoice_line_type_stmt FROM @add_invoice_line_type_sql;
EXECUTE add_invoice_line_type_stmt;
DEALLOCATE PREPARE add_invoice_line_type_stmt;

-- ============================================================
-- sales_invoice_lines: Add item_id column
-- ============================================================
SET @invoice_item_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND COLUMN_NAME = 'item_id'
);

SET @add_invoice_item_id_sql := IF(
  @invoice_item_id_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD COLUMN item_id BIGINT UNSIGNED DEFAULT NULL AFTER line_type',
  'SELECT 1'
);

PREPARE add_invoice_item_id_stmt FROM @add_invoice_item_id_sql;
EXECUTE add_invoice_item_id_stmt;
DEALLOCATE PREPARE add_invoice_item_id_stmt;

-- ============================================================
-- sales_invoice_lines: Add CHECK constraint for line_type values
-- ============================================================
SET @invoice_line_type_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND CONSTRAINT_NAME = 'chk_sales_invoice_lines_line_type'
);

SET @add_invoice_line_type_check_sql := IF(
  @invoice_line_type_check_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD CONSTRAINT chk_sales_invoice_lines_line_type CHECK (line_type IN (''SERVICE'', ''PRODUCT''))',
  'SELECT 1'
);

PREPARE add_invoice_line_type_check_stmt FROM @add_invoice_line_type_check_sql;
EXECUTE add_invoice_line_type_check_stmt;
DEALLOCATE PREPARE add_invoice_line_type_check_stmt;

-- ============================================================
-- sales_invoice_lines: Add CHECK constraint for PRODUCT requiring item_id
-- ============================================================
SET @invoice_product_item_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND CONSTRAINT_NAME = 'chk_sales_invoice_lines_product_item_required'
);

SET @add_invoice_product_item_check_sql := IF(
  @invoice_product_item_check_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD CONSTRAINT chk_sales_invoice_lines_product_item_required CHECK (line_type <> ''PRODUCT'' OR item_id IS NOT NULL)',
  'SELECT 1'
);

PREPARE add_invoice_product_item_check_stmt FROM @add_invoice_product_item_check_sql;
EXECUTE add_invoice_product_item_check_stmt;
DEALLOCATE PREPARE add_invoice_product_item_check_stmt;

-- ============================================================
-- sales_invoice_lines: Add index on item_id (for item-centric queries)
-- ============================================================
SET @invoice_item_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND INDEX_NAME = 'idx_sales_invoice_lines_item_id'
);

SET @add_invoice_item_id_idx_sql := IF(
  @invoice_item_id_idx_exists = 0,
  'CREATE INDEX idx_sales_invoice_lines_item_id ON sales_invoice_lines (item_id)',
  'SELECT 1'
);

PREPARE add_invoice_item_id_idx_stmt FROM @add_invoice_item_id_idx_sql;
EXECUTE add_invoice_item_id_idx_stmt;
DEALLOCATE PREPARE add_invoice_item_id_idx_stmt;

-- ============================================================
-- sales_invoice_lines: Add composite index for scoped FK
-- ============================================================
SET @invoice_company_item_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND INDEX_NAME = 'idx_sales_invoice_lines_company_item'
);

SET @add_invoice_company_item_idx_sql := IF(
  @invoice_company_item_idx_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD KEY idx_sales_invoice_lines_company_item (company_id, item_id)',
  'SELECT 1'
);

PREPARE add_invoice_company_item_idx_stmt FROM @add_invoice_company_item_idx_sql;
EXECUTE add_invoice_company_item_idx_stmt;
DEALLOCATE PREPARE add_invoice_company_item_idx_stmt;

-- ============================================================
-- sales_invoice_lines: Add scoped FK to items
-- ============================================================
SET @invoice_item_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoice_lines'
    AND CONSTRAINT_NAME = 'fk_sales_invoice_lines_item'
);

SET @add_invoice_item_fk_sql := IF(
  @invoice_item_fk_exists = 0,
  'ALTER TABLE sales_invoice_lines ADD CONSTRAINT fk_sales_invoice_lines_item FOREIGN KEY (company_id, item_id) REFERENCES items(company_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);

PREPARE add_invoice_item_fk_stmt FROM @add_invoice_item_fk_sql;
EXECUTE add_invoice_item_fk_stmt;
DEALLOCATE PREPARE add_invoice_item_fk_stmt;

-- ============================================================
-- sales_order_lines: Add line_type column
-- ============================================================
SET @order_line_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND COLUMN_NAME = 'line_type'
);

SET @add_order_line_type_sql := IF(
  @order_line_type_exists = 0,
  'ALTER TABLE sales_order_lines ADD COLUMN line_type VARCHAR(16) NOT NULL DEFAULT ''SERVICE'' AFTER line_no',
  'SELECT 1'
);

PREPARE add_order_line_type_stmt FROM @add_order_line_type_sql;
EXECUTE add_order_line_type_stmt;
DEALLOCATE PREPARE add_order_line_type_stmt;

-- ============================================================
-- sales_order_lines: Add item_id column
-- ============================================================
SET @order_item_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND COLUMN_NAME = 'item_id'
);

SET @add_order_item_id_sql := IF(
  @order_item_id_exists = 0,
  'ALTER TABLE sales_order_lines ADD COLUMN item_id BIGINT UNSIGNED DEFAULT NULL AFTER line_type',
  'SELECT 1'
);

PREPARE add_order_item_id_stmt FROM @add_order_item_id_sql;
EXECUTE add_order_item_id_stmt;
DEALLOCATE PREPARE add_order_item_id_stmt;

-- ============================================================
-- sales_order_lines: Add CHECK constraint for line_type values
-- ============================================================
SET @order_line_type_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND CONSTRAINT_NAME = 'chk_sales_order_lines_line_type'
);

SET @add_order_line_type_check_sql := IF(
  @order_line_type_check_exists = 0,
  'ALTER TABLE sales_order_lines ADD CONSTRAINT chk_sales_order_lines_line_type CHECK (line_type IN (''SERVICE'', ''PRODUCT''))',
  'SELECT 1'
);

PREPARE add_order_line_type_check_stmt FROM @add_order_line_type_check_sql;
EXECUTE add_order_line_type_check_stmt;
DEALLOCATE PREPARE add_order_line_type_check_stmt;

-- ============================================================
-- sales_order_lines: Add CHECK constraint for PRODUCT requiring item_id
-- ============================================================
SET @order_product_item_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND CONSTRAINT_NAME = 'chk_sales_order_lines_product_item_required'
);

SET @add_order_product_item_check_sql := IF(
  @order_product_item_check_exists = 0,
  'ALTER TABLE sales_order_lines ADD CONSTRAINT chk_sales_order_lines_product_item_required CHECK (line_type <> ''PRODUCT'' OR item_id IS NOT NULL)',
  'SELECT 1'
);

PREPARE add_order_product_item_check_stmt FROM @add_order_product_item_check_sql;
EXECUTE add_order_product_item_check_stmt;
DEALLOCATE PREPARE add_order_product_item_check_stmt;

-- ============================================================
-- sales_order_lines: Add index on item_id (for item-centric queries)
-- ============================================================
SET @order_item_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND INDEX_NAME = 'idx_sales_order_lines_item_id'
);

SET @add_order_item_id_idx_sql := IF(
  @order_item_id_idx_exists = 0,
  'CREATE INDEX idx_sales_order_lines_item_id ON sales_order_lines (item_id)',
  'SELECT 1'
);

PREPARE add_order_item_id_idx_stmt FROM @add_order_item_id_idx_sql;
EXECUTE add_order_item_id_idx_stmt;
DEALLOCATE PREPARE add_order_item_id_idx_stmt;

-- ============================================================
-- sales_order_lines: Add composite index for scoped FK
-- ============================================================
SET @order_company_item_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND INDEX_NAME = 'idx_sales_order_lines_company_item'
);

SET @add_order_company_item_idx_sql := IF(
  @order_company_item_idx_exists = 0,
  'ALTER TABLE sales_order_lines ADD KEY idx_sales_order_lines_company_item (company_id, item_id)',
  'SELECT 1'
);

PREPARE add_order_company_item_idx_stmt FROM @add_order_company_item_idx_sql;
EXECUTE add_order_company_item_idx_stmt;
DEALLOCATE PREPARE add_order_company_item_idx_stmt;

-- ============================================================
-- sales_order_lines: Add scoped FK to items
-- ============================================================
SET @order_item_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_order_lines'
    AND CONSTRAINT_NAME = 'fk_sales_order_lines_item'
);

SET @add_order_item_fk_sql := IF(
  @order_item_fk_exists = 0,
  'ALTER TABLE sales_order_lines ADD CONSTRAINT fk_sales_order_lines_item FOREIGN KEY (company_id, item_id) REFERENCES items(company_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);

PREPARE add_order_item_fk_stmt FROM @add_order_item_fk_sql;
EXECUTE add_order_item_fk_stmt;
DEALLOCATE PREPARE add_order_item_fk_stmt;
