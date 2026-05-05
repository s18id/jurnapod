-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0203_sales_invoices_voided_at_by.sql
-- Story 57.3: Add void audit fields to sales_invoices
-- Description: Add voided_at and voided_by columns to sales_invoices for AR invoice void audit trail
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add voided_at column if missing
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND column_name = 'voided_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN voided_at DATETIME NULL DEFAULT NULL COMMENT "Timestamp when invoice was voided" AFTER paid_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add voided_by column if missing
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND column_name = 'voided_by'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN voided_by BIGINT UNSIGNED NULL DEFAULT NULL COMMENT "User who voided the invoice" AFTER voided_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;