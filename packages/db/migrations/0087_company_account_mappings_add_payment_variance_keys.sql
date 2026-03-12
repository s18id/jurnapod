-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add PAYMENT_VARIANCE_GAIN and PAYMENT_VARIANCE_LOSS keys to company_account_mappings
-- ADR-0008: Payment Variance Forex Delta - company-level variance accounts
-- These keys are company-only (not outlet-level)

-- ============================================================
-- Drop existing CHECK constraint on company_account_mappings (idempotent)
-- ============================================================
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'company_account_mappings'
    AND constraint_name = 'chk_company_account_mappings_key'
    AND constraint_type = 'CHECK'
);

SET @stmt = IF(
  @constraint_exists = 1,
  'ALTER TABLE company_account_mappings DROP CONSTRAINT chk_company_account_mappings_key',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add new CHECK constraint with payment variance keys
-- ============================================================
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'company_account_mappings'
    AND constraint_name = 'chk_company_account_mappings_key'
    AND constraint_type = 'CHECK'
);

SET @stmt = IF(
  @constraint_exists = 0,
  'ALTER TABLE company_account_mappings ADD CONSTRAINT chk_company_account_mappings_key CHECK (mapping_key IN (''AR'', ''SALES_REVENUE'', ''SALES_RETURNS'', ''INVOICE_PAYMENT_BANK'', ''PAYMENT_VARIANCE_GAIN'', ''PAYMENT_VARIANCE_LOSS''))',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Note: outlet_account_mappings constraint remains unchanged
-- Payment variance is company-only (not outlet-specific)
-- ============================================================
