-- Add default flag to outlet_payment_method_mappings
-- is_invoice_default: indicates the default payment method for backoffice invoice payments

-- Add column only if missing (idempotent)
SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_payment_method_mappings'
    AND COLUMN_NAME = 'is_invoice_default'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE outlet_payment_method_mappings ADD COLUMN is_invoice_default TINYINT(1) NOT NULL DEFAULT 0 AFTER account_id',
  'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

-- Add index to efficiently query default payment method (idempotent)
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_payment_method_mappings'
    AND INDEX_NAME = 'idx_outlet_payment_invoice_default'
);

SET @add_index_sql := IF(
  @index_exists = 0,
  'CREATE INDEX idx_outlet_payment_invoice_default ON outlet_payment_method_mappings(company_id, outlet_id, is_invoice_default)',
  'SELECT 1'
);

PREPARE add_index_stmt FROM @add_index_sql;
EXECUTE add_index_stmt;
DEALLOCATE PREPARE add_index_stmt;

-- Note: Uniqueness constraint (only one default per outlet) will be enforced at application level
-- to avoid complex DB triggers and allow for flexible validation messages
