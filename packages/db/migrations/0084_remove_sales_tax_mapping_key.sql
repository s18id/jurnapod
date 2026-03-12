-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Remove SALES_TAX from account mapping CHECK constraints
-- This aligns with ADR-0007 tax account decoupling - tax liability accounts 
-- are now sourced from tax_rates.account_id instead of hardcoded SALES_TAX mapping
-- Uses dynamic DDL pattern for MySQL/MariaDB compatibility

-- ============================================================
-- Backfill tax_rates.account_id from legacy SALES_TAX mappings (idempotent)
-- Only fills rates that have no account_id yet
-- ============================================================
SET @backfill_needed = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tax_rates'
    AND column_name = 'account_id'
);

SET @stmt = IF(
  @backfill_needed = 1,
  'UPDATE tax_rates tr INNER JOIN company_account_mappings cam ON cam.company_id = tr.company_id AND cam.mapping_key = ''SALES_TAX'' SET tr.account_id = cam.account_id WHERE tr.account_id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Clean up existing SALES_TAX rows (required before constraint change)
-- ============================================================
DELETE FROM company_account_mappings WHERE mapping_key = 'SALES_TAX';
DELETE FROM outlet_account_mappings WHERE mapping_key = 'SALES_TAX';

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
-- Drop existing CHECK constraint on outlet_account_mappings (idempotent)
-- ============================================================
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'outlet_account_mappings'
    AND constraint_name = 'chk_outlet_account_mappings_mapping_key'
    AND constraint_type = 'CHECK'
);

SET @stmt = IF(
  @constraint_exists = 1,
  'ALTER TABLE outlet_account_mappings DROP CONSTRAINT chk_outlet_account_mappings_mapping_key',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add new CHECK constraint on company_account_mappings (idempotent)
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
  'ALTER TABLE company_account_mappings ADD CONSTRAINT chk_company_account_mappings_key CHECK (mapping_key IN (''AR'', ''SALES_REVENUE'', ''SALES_RETURNS'', ''INVOICE_PAYMENT_BANK''))',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add new CHECK constraint on outlet_account_mappings (idempotent)
-- ============================================================
SET @constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'outlet_account_mappings'
    AND constraint_name = 'chk_outlet_account_mappings_mapping_key'
    AND constraint_type = 'CHECK'
);

SET @stmt = IF(
  @constraint_exists = 0,
  'ALTER TABLE outlet_account_mappings ADD CONSTRAINT chk_outlet_account_mappings_mapping_key CHECK (mapping_key IN (''CASH'', ''QRIS'', ''CARD'', ''SALES_REVENUE'', ''SALES_RETURNS'', ''AR'', ''INVOICE_PAYMENT_BANK''))',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
