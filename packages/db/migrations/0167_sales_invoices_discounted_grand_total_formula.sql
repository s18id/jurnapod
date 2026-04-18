-- Migration: 0167_sales_invoices_discounted_grand_total_formula.sql
-- Purpose: Align sales_invoices grand_total CHECK with header-discount formula
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: yes

SET FOREIGN_KEY_CHECKS=0;

SELECT VERSION() LIKE '%MariaDB%' INTO @is_mariadb;

SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sales_invoices';

SELECT COUNT(*) INTO @constraint_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sales_invoices'
  AND CONSTRAINT_NAME = 'chk_sales_invoices_grand_total_formula';

SET @drop_constraint_sql = IF(
  @table_exists = 1 AND @constraint_exists = 1,
  IF(
    @is_mariadb = 1,
    'ALTER TABLE sales_invoices DROP CONSTRAINT chk_sales_invoices_grand_total_formula',
    'ALTER TABLE sales_invoices DROP CHECK chk_sales_invoices_grand_total_formula'
  ),
  'SELECT ''chk_sales_invoices_grand_total_formula not present or table missing'' AS msg;'
);

PREPARE stmt FROM @drop_constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @constraint_exists_after_drop
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sales_invoices'
  AND CONSTRAINT_NAME = 'chk_sales_invoices_grand_total_formula';

SET @add_constraint_sql = IF(
  @table_exists = 1 AND @constraint_exists_after_drop = 0,
  "ALTER TABLE sales_invoices ADD CONSTRAINT chk_sales_invoices_grand_total_formula CHECK (grand_total = ROUND(subtotal - ROUND(subtotal * (COALESCE(discount_percent, 0) / 100), 2) - COALESCE(discount_fixed, 0) + tax_amount, 2))",
  'SELECT ''chk_sales_invoices_grand_total_formula already set or table missing'' AS msg;'
);

PREPARE stmt FROM @add_constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
