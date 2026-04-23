-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0194_add_sales_payments_fx_ack.sql
-- Epic 50: FX Acknowledgment Gating for Sales AR Payment Posting
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- Add fx_acknowledged_at and fx_acknowledged_by columns to sales_payments
-- These columns allow ACCOUNTANT+ users to explicitly acknowledge FX delta
-- before a payment with non-zero payment_delta_idr can be posted.

-- Step 1: Add fx_acknowledged_at column (idempotent)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'fx_acknowledged_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN fx_acknowledged_at DATETIME NULL AFTER shortfall_settled_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add fx_acknowledged_by column (idempotent)
SET @col2_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'fx_acknowledged_by'
);
SET @sql2 = IF(@col2_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN fx_acknowledged_by INT UNSIGNED NULL AFTER fx_acknowledged_at',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Step 3: Add FK constraint for fx_acknowledged_by (optional, non-blocking)
-- NOTE: FK creation deferred - users table may have non-InnoDB engine in some environments.
-- The column is nullable, so FK is only enforced when a value is present.
-- Run separately when environment is confirmed to support FK:
-- ALTER TABLE sales_payments ADD CONSTRAINT fk_sales_payments_fx_ack_user FOREIGN KEY (fx_acknowledged_by) REFERENCES users(id);

-- Verify columns exist for idempotency check
SET @col1_ok = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'fx_acknowledged_at'
);
SET @col2_ok = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'fx_acknowledged_by'
);
SELECT CONCAT('fx_ack columns present: ', @col1_ok, ', ', @col2_ok) AS migration_status;