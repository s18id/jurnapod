-- 0092_sales_payments_manual_shortfall_loss.sql
-- Add audit columns for manual shortfall settlement on invoice payments
-- Applies only to sales_payments (SALES_PAYMENT_IN flow), not POS

-- ============================================================
-- Add shortfall_settled_as_loss column
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'shortfall_settled_as_loss'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN shortfall_settled_as_loss TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_delta_idr',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add shortfall_reason column
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'shortfall_reason'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN shortfall_reason VARCHAR(500) NULL AFTER shortfall_settled_as_loss',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add shortfall_settled_by_user_id column
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'shortfall_settled_by_user_id'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN shortfall_settled_by_user_id BIGINT UNSIGNED NULL AFTER shortfall_reason',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add shortfall_settled_at column
-- ============================================================
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'shortfall_settled_at'
);

SET @stmt = IF(
  @column_exists = 0,
  'ALTER TABLE sales_payments ADD COLUMN shortfall_settled_at DATETIME NULL AFTER shortfall_settled_by_user_id',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add index for querying manual shortfall settlements
-- ============================================================
SET @index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND index_name = 'idx_sales_payments_shortfall'
);

SET @stmt = IF(
  @index_exists = 0,
  'ALTER TABLE sales_payments ADD INDEX idx_sales_payments_shortfall (company_id, shortfall_settled_as_loss)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
