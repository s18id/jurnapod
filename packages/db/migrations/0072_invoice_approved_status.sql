-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add APPROVED status to sales_invoices
-- New flow: DRAFT -> APPROVED -> POSTED -> PAID
-- VOID can be applied at any stage

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND COLUMN_NAME = 'approved_by_user_id'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN approved_by_user_id BIGINT UNSIGNED DEFAULT NULL AFTER grand_total',
  'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

SET @column_exists2 := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND COLUMN_NAME = 'approved_at'
);

SET @add_column_sql2 := IF(
  @column_exists2 = 0,
  'ALTER TABLE sales_invoices ADD COLUMN approved_at DATETIME DEFAULT NULL AFTER approved_by_user_id',
  'SELECT 1'
);

PREPARE add_column_stmt2 FROM @add_column_sql2;
EXECUTE add_column_stmt2;
DEALLOCATE PREPARE add_column_stmt2;

-- Add foreign keys for approved_by_user_id
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND CONSTRAINT_NAME = 'fk_sales_invoices_approved_by_user'
);

SET @add_fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE sales_invoices ADD CONSTRAINT fk_sales_invoices_approved_by_user FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE add_fk_stmt FROM @add_fk_sql;
EXECUTE add_fk_stmt;
DEALLOCATE PREPARE add_fk_stmt;

-- Update CHECK constraint to include APPROVED
ALTER TABLE sales_invoices DROP CONSTRAINT chk_sales_invoices_status;
ALTER TABLE sales_invoices ADD CONSTRAINT chk_sales_invoices_status CHECK (status IN ('DRAFT', 'APPROVED', 'POSTED', 'VOID'));
