-- Migration 0164: Add customer_id to sales_invoices
-- Story 44.2: Invoice -> Customer Link
-- Adds nullable BIGINT UNSIGNED customer_id column with FK and index
-- Idempotent: safe to rerun even if column/index/FK already exist

-- Step 1: Add customer_id column if not exists
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND column_name = 'customer_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN customer_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add index if not exists
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND index_name = 'idx_sales_invoices_customer_id'
);
SET @sql2 = IF(@idx_exists = 0,
  'CREATE INDEX idx_sales_invoices_customer_id ON sales_invoices(customer_id)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Step 3: Add foreign key constraint if not exists
-- Note: ON DELETE RESTRICT prevents deleting customers with active invoices
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_invoices'
    AND constraint_name = 'fk_sales_invoices_customer_id'
);
SET @sql3 = IF(@fk_exists = 0,
  'ALTER TABLE sales_invoices ADD CONSTRAINT fk_sales_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;