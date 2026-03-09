-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add client_ref for sales_orders idempotency
SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_orders'
    AND COLUMN_NAME = 'client_ref'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE sales_orders ADD COLUMN client_ref CHAR(36) DEFAULT NULL AFTER order_no',
  'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

-- Add unique key for idempotency
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_orders'
    AND INDEX_NAME = 'uq_sales_orders_company_client_ref'
);

SET @add_idx_sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_sales_orders_company_client_ref ON sales_orders (company_id, client_ref)',
  'SELECT 1'
);

PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;
