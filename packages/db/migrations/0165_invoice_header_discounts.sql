-- Migration: 0165_invoice_header_discounts.sql
-- Table: sales_invoices
-- Adds optional invoice-level header discounts (percent + fixed) applied AFTER line subtotals and BEFORE tax.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: uses information_schema check before ALTER

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add discount_percent column (decimal 5,2 supports 0.00 to 100.00)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND column_name = 'discount_percent'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN discount_percent decimal(5,2) NULL AFTER tax_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add discount_fixed column (decimal 18,2 supports large fixed discounts)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND column_name = 'discount_fixed'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN discount_fixed decimal(18,2) NULL AFTER discount_percent',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for reporting queries filtering by discount
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND index_name = 'idx_sales_invoices_discount'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE sales_invoices ADD INDEX idx_sales_invoices_discount (company_id, discount_percent, discount_fixed)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
