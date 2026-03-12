-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add payment variance columns to sales_payments for ADR-0008 (Payment Variance Forex Delta)
-- Stores invoice amount applied and payment amount to compute variance on final settlement

-- ============================================================
-- Add invoice_amount_idr column (nullable)
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'invoice_amount_idr'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN invoice_amount_idr DECIMAL(18,2) NULL AFTER amount',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add payment_amount_idr column (nullable)
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'payment_amount_idr'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN payment_amount_idr DECIMAL(18,2) NULL AFTER invoice_amount_idr',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add payment_delta_idr column (NOT NULL DEFAULT 0)
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'payment_delta_idr'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN payment_delta_idr DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER payment_amount_idr',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add index for variance reporting/filtering
-- ============================================================
SET @index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND index_name = 'idx_sales_payments_company_delta'
);

SET @stmt = IF(
  @index_exists = 0,
  'ALTER TABLE sales_payments ADD KEY idx_sales_payments_company_delta (company_id, payment_delta_idr)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Backfill existing POSTED payments (idempotent)
-- For historical payments, set invoice_amount_idr = amount, payment_amount_idr = amount, delta = 0
-- This preserves existing behavior - variance only applies to new payments on final settlement
-- ============================================================
SET @column_check = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'invoice_amount_idr'
);

IF @column_check = 1 THEN
  UPDATE sales_payments 
  SET invoice_amount_idr = amount, 
      payment_amount_idr = amount, 
      payment_delta_idr = 0 
  WHERE status = 'POSTED' 
    AND (invoice_amount_idr IS NULL OR payment_amount_idr IS NULL);
END IF;
