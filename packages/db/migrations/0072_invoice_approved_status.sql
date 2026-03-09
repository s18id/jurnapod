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

-- Add index for approved_by_user_id
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND INDEX_NAME = 'idx_sales_invoices_approved_by_user_id'
);

SET @add_idx_sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_sales_invoices_approved_by_user_id ON sales_invoices (approved_by_user_id)',
  'SELECT 1'
);

PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- Update CHECK constraint to include APPROVED
SET @chk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND CONSTRAINT_NAME = 'chk_sales_invoices_status'
);

SET @drop_chk_sql := IF(
  @chk_exists = 0,
  'SELECT 1',
  'ALTER TABLE sales_invoices DROP CONSTRAINT chk_sales_invoices_status'
);

PREPARE drop_chk_stmt FROM @drop_chk_sql;
EXECUTE drop_chk_stmt;
DEALLOCATE PREPARE drop_chk_stmt;

ALTER TABLE sales_invoices ADD CONSTRAINT chk_sales_invoices_status CHECK (status IN ('DRAFT', 'APPROVED', 'POSTED', 'VOID'));
