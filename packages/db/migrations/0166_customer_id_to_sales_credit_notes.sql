-- Migration: 0166_customer_id_to_sales_credit_notes.sql
-- Story 44.5: Credit Note Customer Flow
-- Adds nullable customer_id column with FK and index to sales_credit_notes
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: uses information_schema checks before each ALTER

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- -------------------------------------------------------------------------
-- Step 1: Add customer_id column (BIGINT UNSIGNED NULL)
-- -------------------------------------------------------------------------
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_credit_notes'
    AND column_name = 'customer_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_credit_notes ADD COLUMN customer_id BIGINT UNSIGNED NULL AFTER amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------------
-- Step 2: Add index for join performance
-- -------------------------------------------------------------------------
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_credit_notes'
    AND index_name = 'idx_sales_credit_notes_customer_id'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_sales_credit_notes_customer_id ON sales_credit_notes (customer_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------------
-- Step 3: Add foreign key constraint
-- ON DELETE RESTRICT prevents deleting customers that have active credit notes
-- -------------------------------------------------------------------------
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_credit_notes'
    AND constraint_name = 'fk_sales_credit_notes_customer_id'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE sales_credit_notes ADD CONSTRAINT fk_sales_credit_notes_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;