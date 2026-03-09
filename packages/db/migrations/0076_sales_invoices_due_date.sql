-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add due_date for invoice payment term workflows and AR ageing.

SET @due_date_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND COLUMN_NAME = 'due_date'
);

SET @add_due_date_column_sql := IF(
  @due_date_column_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN due_date DATE DEFAULT NULL AFTER invoice_date',
  'SELECT 1'
);

PREPARE add_due_date_column_stmt FROM @add_due_date_column_sql;
EXECUTE add_due_date_column_stmt;
DEALLOCATE PREPARE add_due_date_column_stmt;

SET @ageing_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND INDEX_NAME = 'idx_sales_inv_ar_ageing'
);

SET @add_ageing_index_sql := IF(
  @ageing_index_exists = 0,
  'CREATE INDEX idx_sales_inv_ar_ageing ON sales_invoices (company_id, status, payment_status, due_date, outlet_id)',
  'SELECT 1'
);

PREPARE add_ageing_index_stmt FROM @add_ageing_index_sql;
EXECUTE add_ageing_index_stmt;
DEALLOCATE PREPARE add_ageing_index_stmt;
